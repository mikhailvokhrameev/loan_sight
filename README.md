# LoanSight - Веб-сервис оценки кредитного риска

Данный репозиторий содержит проект по разработке веб-сервиса для оценки кредитного риска заёмщика на основе машинного обучения. Сервис принимает данные клиента из базы, запускает выбранную ML-модель и возвращает вероятность дефолта с человекочитаемой меткой риска (Low / Medium / High), а также интерактивный SHAP waterfall chart - визуальное объяснение того, какие именно признаки повлияли на результат и в какую сторону.

<div align="center">
<img src="https://github.com/user-attachments/assets/07d1e6eb-31e3-4aa1-9622-5620cbfb4043" width="800"><br>
<em>Домашняя страница</em>
</div>

---

### Почему я сделал этот проект

Мне хотелось перейти от уровня учебных и исследовательских ML-проектов к созданию полноценного ML веб-сервиса.

Я получил опыт работы с:
- интерпретируемостью ML-моделей через SHAP-значения и их визуализацией;
- построением REST API на Django REST Framework с JWT-аутентификацией;
- разработкой SPA на React с Vite и Tailwind CSS;
- контейнеризацией полного стека (Django + React + PostgreSQL) через Docker Compose;
- проектированием реальной базы признаков (200+ фичей) и feature engineering поверх неё.

---

### Используемые технологии

#### Backend

- **Python 3.11**
- **Django 4.2** - веб-фреймворк, ORM, миграции, управление пользователями
- **Django REST Framework** - построение REST API
- **djangorestframework-simplejwt** - JWT-аутентификация; токены хранятся в httpOnly cookies для защиты от XSS
- **django-cors-headers** - CORS-заголовки для разрешения запросов от React-фронтенда
- **PostgreSQL 15** - реляционная СУБД; хранит пользователей, эксперименты, метаданные моделей и фичи ~300 000 клиентов
- **psycopg2-binary** - адаптер Python → PostgreSQL
- **python-decouple** - загрузка конфигурации из `.env`-файла

#### Machine Learning

- **scikit-learn** - Pipeline для LogisticRegression (SimpleImputer + StandardScaler + классификатор)
- **LightGBM, XGBoost, CatBoost**
- **SHAP** - вычисление вкладов признаков (TreeExplainer для бустинговых моделей, LinearExplainer для LogReg); объяснение предсказаний
- **joblib** - сериализация и быстрая загрузка обученных моделей с кешированием в памяти
- **numpy, pandas**

#### Frontend

- **React 19** - SPA-фреймворк, компонентная архитектура
- **Vite 8** - сборщик и dev-сервер с HMR, быстрая пересборка
- **Tailwind CSS 3** - Utility-first CSS, все стили прямо в JSX
- **Recharts** - визуализация SHAP waterfall chart и метрик моделей
- **Axios** - HTTP-клиент для запросов к API, interceptors для автообновления токена
- **React Router v7** - клиентская маршрутизация (SPA-навигация без перезагрузки страницы)

#### Инфраструктура

- **Docker**
- **Docker Compose** - оркестрация трёх контейнеров (db, backend, frontend) с health-check'ами и volumes
- **pytest + pytest-django** - юнит и интеграционное тестирование API

---

### Возможности сервиса

#### Аутентификация
Регистрация по email и паролю. JWT-токены передаются через httpOnly cookies — браузер не даёт JS-коду прочитать их, что защищает от XSS-атак. Access-токен автоматически обновляется через refresh endpoint.

<div align="center">
<img src="https://github.com/user-attachments/assets/720df1c8-fc94-4db4-bb34-4324b0c3fae2" width="800"><br>
<em>Cтраница регистрации</em>
</div>

#### Оценка кредитного риска (одиночный режим)
Пользователь вводит ID клиента из базы. Бэкенд загружает 200+ признаков клиента, применяет выбранную ML-модель и возвращает:
- **вероятность дефолта** (0–100%);
- **метку риска**: Low (< 7%), Medium (7–14%), High (> 14%);
- **SHAP waterfall chart** — bar-chart с топ-15 признаками, которые сдвинули предсказание от базового значения вверх или вниз.

<div align="center">
<img src="https://github.com/user-attachments/assets/2e333748-6cac-4d7c-87f4-746088717640" width="800"><br>
<em>Cтраница создания эксперимента (одиночный режим) </em>
</div>
<br>
<div align="center">
<img src="https://github.com/user-attachments/assets/9d090f5e-d5bf-4d5b-9745-d3ecb036850b" width="800"><br>
<em>Результат создания эксперимента (одиночный режим) </em>
</div>

#### Оценка кредитного риска (режим сравнения двух моделей)
Одновременно запускаются две модели (параллельно, через `ThreadPoolExecutor`). Ответ содержит вероятности, метки риска, SHAP-диаграммы и задержку инференса для каждой модели, а также разницу в процентных пунктах между скорами.

<div align="center">
<img src="https://github.com/user-attachments/assets/b24cb7dd-790b-4fd2-81be-61bb7ea9a0ca" width="800"><br>
<em>Cтраница создания эксперимента (режим сравнения двух моделей) </em>
</div>
<br>
<div align="center">
<img src="https://github.com/user-attachments/assets/bf31067b-07d2-4f43-90ee-997d8ed86ffb" width="800"><br>
<em>Результат создания эксперимента (режим сравнения двух моделей) </em>
</div>

#### Режим ручного переопределения признаков (Manual Override)
Перед запуском оценки можно открыть панель и изменить числовые (доход, сумма кредита, стаж, внешние скоринговые баллы) и категориальные (тип занятости, семейное положение, образование и др.) признаки клиента. Это позволяет моделировать сценарии «что если».

<div align="center">
<img src="https://github.com/user-attachments/assets/90c06a7e-c6e4-4522-961e-7e25d2faa4a1" width="800"><br>
<em>Cтраница создания эксперимента (режим ручного переопределения признаков) </em>
</div>

#### Мультивалютность
Числовые денежные поля (AMT_INCOME_TOTAL, AMT_CREDIT и др.) отображаются в выбранной валюте (RUB, USD, EUR, GBP, KZT, BYN). Курс подтягивается с внешнего API в реальном времени и кешируется на час.

#### Каталог клиентов (Client Selector)
Два способа найти клиента для анализа:
- **Presets** — 5 архетипов (Ideal Borrower, At Risk, Young Specialist, Typical Defaulter, Pensioner), подобранных из базы по наборам условий;
- **Поиск по фильтрам** — фильтрация по возрасту, доходу, наличию просрочек; возвращает 10 случайных подходящих клиентов.

#### История экспериментов
Все запущенные оценки сохраняются в базе. В разделе «Experiments Log» можно просмотреть карточки прошлых экспериментов (тип, скор, дата), нажать на любую — откроется полное модальное окно с результатом и SHAP-графиком. Отдельные записи или вся история удаляются одной кнопкой.

<div align="center">
<img src="https://github.com/user-attachments/assets/699555df-180e-4c79-bdd9-5654aafe1d8a" width="800"><br>
<em>Cтраница c историей экспериментов </em>
</div>

#### Управление моделями
Страница «Models» показывает все зарегистрированные модели с метриками (ROC AUC, Gini, KS, F1 и др.) и прогресс-барами. Через UI можно загрузить новую модель (файл `.joblib` + `metadata.json` с именами фичей и метриками) или удалить существующую.

<div align="center">
<img src="https://github.com/user-attachments/assets/03711380-ab8f-4aea-baa4-cd2ffb84a6f2" width="800"><br>
<em>Cтраница управления моделями</em>
</div>

---

## Запуск в Docker

### Требования
- Docker Desktop (или Docker Engine + Compose plugin)

### Шаги

**1. Клонируйте репозиторий**
```bash
git clone https://github.com/<your-username>/loan_sight.git
cd loan_sight
```

**2. Создайте файл окружения**
```bash
cp .env.example .env
```
Откройте `.env` и заполните переменные:
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

**3. Запустите все сервисы**
```bash
docker compose up --build
```

Docker Compose поднимет три контейнера:
- `loansight_db` — PostgreSQL 15, применит дамп `db/dump.sql` (данные клиентов)
- `loansight_backend` — Django, выполнит `migrate` и `loaddata` (регистрация моделей), запустится на порту 8000
- `loansight_frontend` — React + Vite dev-сервер на порту 5173

**4. Откройте браузер**
```
http://localhost:5173
```

**5. Тесты (опционально)**

Тесты подключаются к PostgreSQL на `localhost:5433`. Пока контейнеры запущены, достаточно выполнить:

```bash
cd backend
pytest
```

**6. Остановка**
```bash
docker compose down          # остановить контейнеры
docker compose down -v       # остановить и удалить volume с данными БД
```
