# LoanSight — Credit Scoring Experimentation Platform

LoanSight is a full-stack web application built for experimenting with a trained LightGBM credit scoring model on the [Home Credit Default Risk](https://www.kaggle.com/c/home-credit-default-risk) dataset. It lets you register as a dataset client (using a real `SK_ID_CURR`), submit loan applications with custom income and credit amounts in any currency, and instantly receive a model-predicted default probability with a risk label.

---

## Overview

The core idea is simple: the Home Credit dataset contains ~300,000 real loan applicants with hundreds of engineered features. This project loads those pre-processed features into a PostgreSQL database, trains a LightGBM model offline, and then serves predictions through a REST API. A user registers with their `SK_ID_CURR` (their client ID from the dataset), and when they submit a loan application with a desired income and credit amount, the backend:

1. Looks up their full feature vector from the database.
2. Overrides the financial fields (`AMT_INCOME_TOTAL`, `AMT_CREDIT`, `AMT_ANNUITY`, etc.) with the new values.
3. Recalculates all dependent ratio features.
4. Converts the amounts from the submitted currency to RUB using a live exchange rate.
5. Feeds the assembled vector into LightGBM and returns the predicted probability of default.

This makes it possible to interactively test "what if" scenarios: how does the model score the same real client with a different income or a larger loan?

---

## Architecture

<img width="2125" height="5063" alt="loansight_full_architecture" src="https://github.com/user-attachments/assets/80952da5-57a4-4c03-8823-8e6fd3a3e3f8" />

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Django 4.2, Django REST Framework |
| Auth | `djangorestframework-simplejwt` (JWT) |
| ML | LightGBM (`lgb.Booster`) |
| Database | PostgreSQL |
| CORS | `django-cors-headers` |
| DB URL parsing | `dj-database-url` |
| Currency API | `open.er-api.com` (cached 1h via Django cache) |
| Reverse proxy | Nginx |

---

## Database Models

### `User`

Extends Django's `AbstractUser`. Email is used as the primary login credential (`USERNAME_FIELD = 'email'`).

| Column | Type | Notes |
|---|---|---|
| `id` | BigAutoField | Primary key |
| `email` | EmailField (unique) | Used as username |
| `username` | CharField (unique) | Set equal to email on registration |
| `first_name` | CharField | |
| `last_name` | CharField | |
| `password` | CharField | Hashed by Django |
| `sk_id_curr` | IntegerField (nullable) | Links the user to a row in `ClientFeature` |
| `is_staff` / `is_superuser` | BooleanField | Standard Django admin flags |
| `date_joined` | DateTimeField | |

`sk_id_curr` is the critical bridge: it tells the ML pipeline which client's feature vector to load when scoring a new application.

---

### `Application`

Stores each scoring request submitted by a user, along with the model's output.

| Column | Type | Notes |
|---|---|---|
| `id` | BigAutoField | Primary key |
| `user` | ForeignKey → User | Owner; CASCADE on delete |
| `sk_id_curr` | IntegerField (nullable) | Snapshot of user's client ID at creation time |
| `amt_income` | DecimalField(15, 2) | Income as submitted (in original currency) |
| `amt_credit` | DecimalField(15, 2) | Requested loan amount (in original currency) |
| `currency` | CharField(10) | ISO currency code, default `RUB` |
| `probability` | FloatField (nullable) | Model output: probability of default [0, 1] |
| `risk_label` | CharField(20) (nullable) | `Low`, `Medium`, or `High` |
| `created_at` | DateTimeField | Auto-set on creation |

Users can only read and delete their own applications (`get_queryset` filters by `user=request.user`).

---

### `ClientFeature`

This is the largest table — it mirrors the full feature-engineered dataset. Each row is one applicant from the Home Credit dataset.

| Column | Type | Notes |
|---|---|---|
| `sk_id_curr` | IntegerField (PK, unique, indexed) | Client identifier |
| *(~250 feature columns)* | FloatField (nullable) | Pre-processed and engineered features |

The columns are **dynamically generated** at class load time using a `RAW_FEATURES` list and Django's `add_to_class()` pattern, so the model definition in `models.py` stays compact:

```python
for feature in RAW_FEATURES:
    sanitized_field = feature.lower().replace(' ', '_').replace(':', '_') \
                              .replace('-', '_').replace('__', '_')
    ClientFeature.add_to_class(sanitized_field, models.FloatField(null=True, blank=True))
```

The ~250 features span six groups from the original Kaggle dataset:

- **Application features** — `NAME_CONTRACT_TYPE`, `CODE_GENDER`, `FLAG_OWN_CAR`, `AMT_INCOME_TOTAL`, `AMT_CREDIT`, `EXT_SOURCE_1/2/3`, demographic and housing fields, document flags.
- **Engineered ratios** — `CREDIT_INCOME_RATIO`, `ANNUITY_INCOME_RATIO`, `CREDIT_ANNUITY_RATIO`, `CREDIT_TERM`, `CREDIT_GOODS_RATIO`, `DAYS_EMPLOYED_PERCENT`, `EXT_SOURCES_MEAN/PROD/STD`, and more.
- **Bureau history** (`BURO_*`) — aggregates from the credit bureau: mean/max credit days, debt sums, active vs closed credit proportions, credit type distributions.
- **Previous applications** (`PREV_*`) — aggregates from Home Credit's prior application records: annuity/credit/goods price means, approval/refusal rates, rejection reasons, product combinations.
- **Installment payments** (`INS_*`) — payment behavior: days before due (DBD), payment differences, amounts paid vs scheduled, DPD-year totals.
- **POS cash balances** (`POS_*`) — point-of-sale loan balance statistics, DPD means, contract status distributions.
- **Credit card balances** (`CC_*`) — card balance stats, drawing amounts/counts by type, payment totals, DPD fields.

---

## API Endpoints

All endpoints are prefixed with `/api/`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `auth/register/` | Public | Create a new user account |
| `POST` | `auth/login/` | Public | Obtain JWT access + refresh tokens |
| `POST` | `auth/refresh/` | Public | Refresh an expired access token |
| `GET` | `auth/me/` | Required | Get current user's profile |
| `PATCH` | `auth/me/` | Required | Update profile fields (name, `sk_id_curr`) |
| `GET` | `applications/` | Required | List all applications for current user |
| `POST` | `applications/` | Required | Submit a new application (triggers ML scoring) |
| `GET` | `applications/{id}/` | Required | Retrieve a single application |
| `DELETE` | `applications/{id}/` | Required | Delete an application |

The `ApplicationViewSet` is a standard DRF `ModelViewSet` registered via `DefaultRouter`, which automatically generates list, create, retrieve, update, and destroy routes.

---

## Authentication Flow (JWT)

Authentication uses `djangorestframework-simplejwt` with the following token configuration:

| Setting | Value |
|---|---|
| Access token lifetime | 1 hour |
| Refresh token lifetime | 7 days |
| Algorithm | HS256 |
| Rotate refresh tokens | Yes |
| Auth header | `Authorization: Bearer <token>` |

**Login flow:**
1. `POST /api/auth/login/` with email + password → returns `{ access, refresh }`.
2. The frontend (`AuthContext.jsx`) stores both tokens (in memory / localStorage) and attaches `Authorization: Bearer <access>` to every subsequent request via an Axios interceptor in `api.js`.
3. On 401 responses, the interceptor automatically calls `POST /api/auth/refresh/` with the refresh token and retries the original request.
4. On logout, tokens are cleared from state and storage.

The `ProtectedRoute` component in React wraps any route that requires authentication. If no valid token is found in context, the user is redirected to `/login`.

---

## ML Scoring Pipeline

All ML logic lives in `backend/api/utils.py`. The pipeline runs synchronously within `ApplicationViewSet.perform_create()` before saving to the database.

### Steps

**1. Currency conversion** (`get_currency_rate`)

```python
rate = get_currency_rate(currency, base_currency='RUB')
amt_income_base = float(amt_income) * rate
amt_credit_base = float(amt_credit) * rate
```

Calls `https://open.er-api.com/v6/latest/{currency}` and caches the result for 1 hour using Django's cache framework. Falls back to a 1:1 rate if the external API is unreachable.

**2. Model loading** (`get_model`)

The `lgb.Booster` is loaded from `backend/ml_models/model.txt` once on first use and stored in a module-level `_model` variable (lazy singleton pattern). Subsequent calls return the cached object without re-reading the file.

**3. Feature retrieval** (`get_client_features_dict`)

Fetches the `ClientFeature` row for the user's `sk_id_curr` and converts it into a dictionary keyed by the uppercase feature names expected by the model (`AMT_CREDIT`, `EXT_SOURCE_1`, etc.).

**4. Feature overriding and ratio recalculation**

The user's submitted `amt_income` and `amt_credit` (converted to RUB) replace the stored values. All derivative ratios are then recalculated to keep the feature vector internally consistent:

```python
feature_dict['AMT_ANNUITY']         = amt_credit_base * annuity_ratio
feature_dict['CREDIT_INCOME_RATIO'] = amt_credit_base / safe_income
feature_dict['ANNUITY_INCOME_RATIO']= feature_dict['AMT_ANNUITY'] / safe_income
feature_dict['CREDIT_ANNUITY_RATIO']= amt_credit_base / safe_annuity
feature_dict['CREDIT_TERM']         = annuity_ratio
feature_dict['CREDIT_GOODS_RATIO']  = goods_ratio
# ... and more
```

The annuity and goods price are preserved proportionally (e.g., if the original loan had an annuity-to-credit ratio of 0.05, that ratio is maintained for the new credit amount).

**5. Vector assembly**

Features are assembled in the exact order `model.feature_name()` expects. Any missing or `NaN` values are replaced with `0.0`.

**6. Prediction**

```python
prob = float(model.predict(X_arr)[0])
```

**7. Risk labeling**

| Probability | Label |
|---|---|
| < 0.07 | `Low` |
| 0.07 – 0.14 | `Medium` |
| ≥ 0.14 | `High` |

The thresholds reflect the Home Credit dataset's baseline default rate (~8%).

---

## CORS Configuration

Cross-Origin Resource Sharing is handled by `django-cors-headers` with `CorsMiddleware` placed high in the middleware stack (before `CommonMiddleware`).

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:3000",
    "http://frontend:5173",    # Docker service name
]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
```

`CORS_ALLOW_CREDENTIALS = True` allows the browser to include cookies and `Authorization` headers in cross-origin requests. In production (behind Nginx), CORS is effectively bypassed because both the React app and Django are served from the same origin.

---

## Frontend Pages & Components

### Pages

**`Home.jsx`** — Public landing page introducing the platform.

**`Login.jsx`** — Email/password form. On success, stores JWT tokens in `AuthContext` and redirects to `/dashboard`. Accepts flash messages passed via React Router's navigation state (e.g., after registration).

**`Register.jsx`** — Registration form with fields for first name, last name, email, password (with confirmation), and an optional `SK_ID_CURR` (the Home Credit client ID). Client-side validation checks password length and match before submission. On success, redirects to Login with a flash notification.

**`Dashboard.jsx`** — The core experiment page. Contains:
- A form to submit a new loan application (income, credit amount, currency selector).
- A history table of all past applications with probability, risk label, and timestamp.
- Delete functionality per application.

**`Profile.jsx`** — Allows the user to update their name and `SK_ID_CURR`. This is how a user switches which dataset client they are impersonating for scoring experiments.

### Components

**`AuthContext.jsx`** — React context providing `user`, `accessToken`, `login()`, `logout()`, and `refreshToken()` to the entire app. The Axios instance in `api.js` reads the token from this context and attaches it to every request header.

**`ProtectedRoute.jsx`** — Wraps routes that require authentication. Redirects unauthenticated users to `/login`.

**`Navbar.jsx`** — Sticky top navigation bar with the LoanSight logo, page links, and the account dropdown.

**`AccountMenu.jsx`** — Dropdown menu showing the user's initials as an avatar button. Contains links to Profile and a Logout action.

**`Icons.jsx`** — Centralized SVG icon components used across the UI.

---

## Getting Started

```bash
docker compose up --build
```

The website runs locally on http://localhost:5173/
