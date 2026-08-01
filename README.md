# LoanSight - Web Service for Credit Risk ML Model Experiments

This repository contains a project for developing a web service to experiment with trained classical machine learning models on the Home Credit Default Risk dataset. The service takes client data from the database, runs the selected ML model, and returns the default probability along with a human-readable risk label (Low / Medium / High) and an interactive SHAP waterfall chart—a visual explanation of which specific features influenced the prediction and in which direction.

<div align="center">
<img src="https://github.com/user-attachments/assets/07d1e6eb-31e3-4aa1-9622-5620cbfb4043" width="800"><br>
<em>Home page</em>
</div>

---

### Why I Built This Project

I wanted to move beyond educational and research-oriented ML projects to create a full-fledged ML web service.

I gained experience working with:
- ML model interpretability using SHAP values and their visualization;
- Building REST APIs with Django REST Framework and JWT authentication;
- Developing SPAs in React with Vite and Tailwind CSS;
- Full-stack containerization (Django + React + PostgreSQL) using Docker Compose;
- Designing a production-like feature store (200+ features) and feature engineering on top of it.

---

### Tech Stack

#### Backend

- **Python 3.11**
- **Django 4.2** - web framework, ORM, migrations, user management
- **Django REST Framework** - building REST APIs
- **djangorestframework-simplejwt** - JWT authentication; tokens are stored in httpOnly cookies for XSS protection
- **django-cors-headers** - CORS headers to allow requests from the React frontend
- **PostgreSQL 15** - relational DBMS; stores users, experiments, model metadata, and features for ~300,000 clients
- **psycopg2-binary** - Python → PostgreSQL adapter
- **python-decouple** - loading configuration from a `.env` file

#### Machine Learning

- **scikit-learn** - Pipeline for LogisticRegression (SimpleImputer + StandardScaler + classifier)
- **LightGBM, XGBoost, CatBoost**
- **SHAP** - computing feature contributions (TreeExplainer for gradient boosting models, LinearExplainer for LogReg); prediction explanations
- **joblib** - serialization and fast loading of trained models with in-memory caching
- **numpy, pandas**

#### Frontend

- **React 19** - SPA framework, component-based architecture
- **Vite 8** - bundler and dev server with HMR, fast rebuilds
- **Tailwind CSS 3** - Utility-first CSS, all styling directly in JSX
- **Recharts** - visualization of SHAP waterfall charts and model metrics
- **Axios** - HTTP client for API requests, interceptors for automatic token refresh
- **React Router v7** - client-side routing (SPA navigation without page reloads)

#### Infrastructure

- **Docker**
- **Docker Compose** - orchestration of three containers (db, backend, frontend) with health checks and volumes
- **pytest + pytest-django** - unit and integration testing of the API

---

### Key Features

#### Authentication
Sign up and sign in using email and password. JWT tokens are transferred via httpOnly cookies—the browser prevents JavaScript code from reading them, protecting against XSS attacks. The access token is automatically refreshed using the refresh endpoint.

<div align="center">
<img src="https://github.com/user-attachments/assets/720df1c8-fc94-4db4-bb34-4324b0c3fae2" width="800"><br>
<em>Registration page</em>
</div>

#### Credit Risk Assessment (Single Model Mode)
The user enters a client ID from the database. The backend loads 200+ features for the client, applies the chosen ML model, and returns:
- **Default probability** (0–100%);
- **Risk label**: Low (< 7%), Medium (7–14%), High (> 14%);
- **SHAP waterfall chart** — bar chart displaying the top 15 features that shifted the prediction up or down from the base value.

<div align="center">
<img src="https://github.com/user-attachments/assets/2e333748-6cac-4d7c-87f4-746088717640" width="800"><br>
<em>Experiment creation page (Single model mode)</em>
</div>
<br>
<div align="center">
<img src="https://github.com/user-attachments/assets/9d090f5e-d5bf-4d5b-9745-d3ecb036850b" width="800"><br>
<em>Experiment result page (Single model mode)</em>
</div>

#### Credit Risk Assessment (Model Comparison Mode)
Two models run simultaneously (in parallel via `ThreadPoolExecutor`). The response contains probabilities, risk labels, SHAP charts, and inference latency for each model, as well as the percentage-point difference between their scores.

<div align="center">
<img src="https://github.com/user-attachments/assets/b24cb7dd-790b-4fd2-81be-61bb7ea9a0ca" width="800"><br>
<em>Experiment creation page (Model comparison mode)</em>
</div>
<br>
<div align="center">
<img src="https://github.com/user-attachments/assets/bf31067b-07d2-4f43-90ee-997d8ed86ffb" width="800"><br>
<em>Experiment result page (Model comparison mode)</em>
</div>

#### Manual Feature Override Mode
Before running the assessment, users can open a panel to modify numerical (income, credit amount, employment length, external scoring scores) and categorical (employment type, marital status, education level, etc.) client features. This enables "what-if" scenario modeling.

<div align="center">
<img src="https://github.com/user-attachments/assets/90c06a7e-c6e4-4522-961e-7e25d2faa4a1" width="800"><br>
<em>Experiment creation page (Manual feature override mode)</em>
</div>

#### Multi-currency Support
Numerical monetary fields (AMT_INCOME_TOTAL, AMT_CREDIT, etc.) are displayed in the selected currency (RUB, USD, EUR, GBP, KZT, BYN). Exchange rates are fetched from an external API in real time and cached for one hour.

#### Client Selector
Two ways to find a client for analysis:
- **Presets** — 5 archetypes (Ideal Borrower, At Risk, Young Specialist, Typical Defaulter, Pensioner) filtered from the database by predefined conditions;
- **Filter Search** — filtering by age, income, and past delinquency status; returns 10 random matching clients.

#### Experiment History
All executed assessments are saved in the database. In the "Experiments Log" section, users can view cards of past experiments (type, score, date) and click any card to open a full modal window with the result and SHAP plot. Individual records or the entire history can be deleted with a single click.

<div align="center">
<img src="https://github.com/user-attachments/assets/699555df-180e-4c79-bdd9-5654aafe1d8a" width="800"><br>
<em>Experiment history page</em>
</div>

#### Model Management
The "Models" page displays all registered models alongside metrics (ROC AUC, Gini, KS, F1, etc.) and progress bars. Through the UI, users can upload a new model (a `.joblib` file + `metadata.json` containing feature names and metrics) or delete an existing one.

<div align="center">
<img src="https://github.com/user-attachments/assets/03711380-ab8f-4aea-baa4-cd2ffb84a6f2" width="800"><br>
<em>Model management page</em>
</div>

---

## Running with Docker

### Prerequisites
- Docker Desktop (or Docker Engine + Compose plugin)

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/<your-username>/loan_sight.git
cd loan_sight
```

**2. Create the environment file**
```bash
cp .env.example .env
```
Open `.env` and fill in the environment variables:
```env
POSTGRES_DB=loansight
POSTGRES_USER=postgres
POSTGRES_PASSWORD=strongpassword
POSTGRES_HOST=db
POSTGRES_PORT=5432
DATABASE_URL=postgres://postgres:strongpassword@db:5432/loansight

SECRET_KEY=your-django-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

**3. Run all services**
```bash
docker compose up --build
```

Docker Compose will spin up three containers:
- `loansight_db` — PostgreSQL 15, applies the `db/dump.sql` dump (client data)
- `loansight_backend` — Django, runs `migrate` and `loaddata` (model registration), listens on port 8000
- `loansight_frontend` — React + Vite dev server running on port 5173

**4. Open your browser**
```
http://localhost:5173
```

**5. Tests (optional)**

Tests connect to PostgreSQL on `localhost:5433`. While the containers are running, simply execute:

```bash
cd backend
pytest
```

**6. Stopping the application**
```bash
docker compose down          # stop containers
docker compose down -v       # stop and remove DB data volume
```
