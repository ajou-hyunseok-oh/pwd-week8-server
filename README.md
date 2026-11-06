# 8주차 FoodMap — Supabase Auth와 관리자·제보 API

7주차의 TypeScript·Express·Supabase PostgreSQL 서버를 이어서 확장합니다. 이메일·비밀번호, Google OAuth, 네이버 OIDC 로그인 세 가지를 모두 필수 실습으로 다룹니다. 기존 `restaurants` 데이터와 `{ data: ... }` 응답, camelCase 맛집 필드를 유지합니다. 이번 주차에는 로그인 사용자 식별, 관리자 권한, 제보 영구 저장과 승인 트랜잭션을 구현합니다.

## 완료 목표

- 이메일·비밀번호, Google OAuth, 네이버 OIDC 로그인이 Supabase Auth의 사용자·세션으로 이어지는 과정을 설명합니다.
- 공급자 콜백과 클라이언트 복귀 URL, 공급자 토큰과 Supabase API 액세스 토큰의 차이를 구분합니다.
- Express가 액세스 토큰을 검증하고, DB의 프로필로 사용자 역할·활성 상태를 확인합니다.
- 관리자만 맛집 등록·수정·삭제, 사용자 목록·역할 변경, 제보 처리를 수행합니다.
- 제보 승인 시 맛집 생성과 상태 변경이 함께 성공하거나 함께 롤백됩니다.
- 서버 재시작과 브라우저 새로고침 후에도 DB 데이터와 로그인 세션이 유지됩니다.

```text
React ── 가입·로그인·갱신 ──→ Supabase Auth
React ── Bearer 액세스 토큰 ──→ Express
Express ── getUser(token) + profiles 조회 ──→ 인증·권한 검사
Express ── 서버용 Secret key ──→ Supabase Data API ──→ PostgreSQL
```

## 1. 시작 위치와 실행 환경

7주차의 본인 Supabase 프로젝트, Git, Node.js **24.22.1**과 npm을 준비합니다. 소셜 로그인에는 본인의 Google·네이버 개발자 계정도 필요합니다. 다음 명령은 macOS/Linux 터미널 또는 Windows Git Bash 기준입니다.

**처음 시작할 때** 실습 폴더를 만들 상위 디렉터리에서 두 저장소를 받습니다. 본인 GitHub 저장소로 배포할 학생은 먼저 수업 저장소 두 개를 각각 Fork하고 아래 주소의 소유자를 본인 GitHub 아이디로 바꿉니다. 이미 8주차 최신본을 받았다면 서버 폴더에서 시작합니다.

```bash
mkdir -p pwd-week8
cd pwd-week8
git clone https://github.com/ajou-hyunseok-oh/pwd-week8-server.git
git clone https://github.com/ajou-hyunseok-oh/pwd-week8-client.git
cd pwd-week8-server
```

서버 폴더에 `server.ts`, `supabase/schema.sql`, `.env.example`이 있고, 옆의 `../pwd-week8-client`에는 `src/config/supabase.js`와 `.env.example`이 있어야 합니다. README 제목에 **Week 6**가 보이거나 이 파일을 찾을 수 없으면 수업에서 배포한 8주차 브랜치·커밋을 확인한 뒤 이어갑니다.

`node --version`이 `v24.22.1`인지 확인합니다. nvm을 사용하는 경우 `nvm install 24.22.1`, `nvm use 24.22.1`로 전환할 수 있습니다. 새 터미널을 열 때도 같은 버전을 사용합니다.

```bash
node --version
npm ci --include=dev
test -f .env || cp .env.example .env
```

## 2. 기존 Supabase 프로젝트에 추가 SQL 적용

1. **7주차 서버부터 중지합니다.** 같은 DB를 쓰는 로컬 7주차 서버는 해당 터미널에서 Ctrl+C로 종료합니다. 7주차에 공개한 Render Web Service도 Dashboard에서 일시 중단(Suspend)합니다. 이전 코드의 공개 맛집 등록·초기화 경로는 서버용 키로 같은 DB에 쓰기 때문입니다. 13절에서 8주차 코드로 교체합니다.
2. Supabase Dashboard에서 **7주차 본인 프로젝트 → SQL Editor**를 엽니다. 먼저 7주차 맛집 수와 내용이 남아 있는지 확인합니다. 예를 들어 `select id, name, rating from public.restaurants order by id;` 결과를 기록합니다.
3. 기존 7주차 테이블이 있다면 아래 **사전 점검 SQL 전체**를 새 쿼리에 붙여넣고 Run을 누릅니다. 결과가 **0행**이면 다음으로 갑니다. 결과가 있으면 `id`, `field`, `current_value`를 확인하고 Table Editor에서 **해당 ID의 값만** 원래 의도한 값으로 수정한 뒤 다시 점검합니다. 예를 들어 기존 평점 7은 0~5 범위의 실제 평점으로 확인해 바로잡습니다. [7주차 데이터 사전 점검 SQL](supabase/preflight-week7.sql)
4. 별도 쿼리에 **schema.sql 전체**를 붙여넣고 Run을 누릅니다. 이 SQL은 기존 맛집 행을 보존하고 프로필·제보 테이블, 역할 권한, 승인 트랜잭션을 추가합니다. 적용과 함께 7주차 초기화 함수 `reset_restaurant_demo_data()`도 제거됩니다. 적용 후 2번의 쿼리로 기존 맛집을 다시 확인합니다. 제약 위반 `23514`로 중단되면 이번 SQL은 전체 롤백됩니다. 3번에서 문제 행을 수정하고 4번을 처음부터 다시 실행합니다. [8주차 스키마 SQL](supabase/schema.sql)
5. 7주차 프로젝트를 쓸 수 없어 **새 빈 프로젝트로 시작하도록 안내받은 경우**에는 2~3번을 건너뛰고 4번부터 수행합니다. 맛집 테이블이 비어 있을 때만 seed.sql을 실행해 원본 3건을 넣습니다. [빈 DB용 시작 데이터](supabase/seed.sql)

| 테이블 | 주요 내용 |
| --- | --- |
| `auth.users` | Supabase가 관리하는 사용자·인증 정보 |
| `public.profiles` | Auth UUID, 이름·이메일·아바타, 역할, 활성 상태 |
| `public.restaurants` | 7주차 맛집 필드, `source_submission_id`, 시각 |
| `public.submissions` | 제보 내용, 실제 제보자 UUID, 상태·검토자·처리 시각 |

프로필은 Auth 사용자 생성 트리거가 만듭니다. 가입 metadata에 `admin`을 넣더라도 새 프로필 역할은 `user`입니다. 비밀번호와 토큰은 public 테이블에 복사하지 않습니다.

브라우저 역할 `anon`, `authenticated`에는 업무 테이블 접근을 허용하지 않습니다. 브라우저는 Auth를 사용하고, 업무 데이터는 Express를 통해 접근합니다. `GET /api/auth/providers`는 로그인 수단별 사용 가능 여부만 공개하며 키·Client ID·내부 공급자 설정은 반환하지 않습니다. 서버용 Secret key는 RLS를 우회하므로 Express 권한 검사가 반드시 필요합니다. PostgreSQL 역할 `service_role`과 애플리케이션 사용자 역할 `admin`은 서로 다른 개념입니다.

## 3. 서버 환경변수

루트 `.env`를 작성합니다. 서버용 키를 React의 `VITE_*` 변수에 넣지 않습니다.

### 3-1. 현재 Dashboard에서 URL·키 찾기

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 **7주차에 사용한 본인 프로젝트**를 선택합니다.
2. 프로젝트 상단 **Connect**를 열어 프로젝트 URL과 Publishable key를 복사합니다. URL을 별도로 확인하려면 현재 메뉴의 **Integrations → Data API**를 사용합니다. 아래 환경변수에는 `https://본인-project-ref.supabase.co` 형식의 기본 URL을 넣으며 `/rest/v1`은 제외합니다.
3. 왼쪽 **Settings → API Keys**를 엽니다. **Publishable key**(`sb_publishable_...`)와 **Secret key**(`sb_secret_...`)를 구분합니다. 아직 새 형식 키가 없는 프로젝트는 해당 구역의 키 생성 기능으로 준비합니다. 기존 7주차 서버에서 사용 중인 키가 있다면 같은 프로젝트의 값을 이어서 사용합니다.
4. Secret key 전체 값을 서버 `.env`의 `SUPABASE_SECRET_KEY`에 넣습니다. 복사·표시에 본인 확인이 필요하면 본인이 완료합니다. Secret을 새로 발급했다면 표시되는 즉시 안전하게 보관하고 기존 서비스가 쓰는 키를 임의로 폐기하지 않습니다.
5. Publishable key는 클라이언트 `.env.local`에 사용합니다. 서버의 실제 Auth 통합 검사도 실행할 때만 아래 `SUPABASE_PUBLISHABLE_KEY`를 채웁니다.

현재 메뉴는 **Settings → API Keys**이며, 예전 자료의 `Settings → API` 화면만 찾지 않도록 합니다. OAuth 앱의 Google·네이버 Client Secret과 Supabase Secret key는 서로 다른 값입니다. [공식 키 찾기 안내](https://supabase.com/docs/guides/getting-started/api-keys#find-and-use-your-keys), [Data API URL 위치](https://supabase.com/docs/guides/api)

### 3-2. 서버 `.env` 작성과 연결 점검

```dotenv
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_replace_with_your_real_key
CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173
# 실제 인증 자동 검사를 실행할 때만 추가합니다.
SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_with_your_key
```

- Project URL에는 `/rest/v1`을 붙이지 않습니다.
- `CLIENT_URL`은 쉼표로 구분한 허용 origin입니다. 경로와 마지막 `/`를 붙이지 않습니다.
- `.env`와 `.env.*`는 Git에서 제외합니다. 실제 값 대신 `.env.example`을 공유합니다.

```bash
npm run db:check
```

`restaurants`, `profiles`, `submissions` 연결 성공이 각각 출력되어야 합니다. 이 명령은 최대 한 행을 읽으며 데이터를 등록·초기화하지 않습니다.

## 4. 서버 기동과 클라이언트 연결

3절에서 `db:check`에 성공한 **서버 터미널**에서 실행하고 켜 둡니다.

```bash
npm run dev
```

브라우저로 두 주소를 엽니다. `http://localhost:3000/health`의 `{"status":"ok"}`는 서버 기동을, `http://localhost:3000/api/restaurants`의 `data` 배열은 서버를 거쳐 DB를 읽을 수 있음을 보여 줍니다. 여기에 2절에서 확인한 맛집이 있는지 대조합니다.

**두 번째 터미널**을 열고 `pwd-week8-client`에서 클라이언트 README **2절**을 진행합니다. 서버와 같은 프로젝트의 URL·Publishable key와 API 주소 `http://localhost:3000`을 `.env.local`에 입력한 뒤 Vite를 실행합니다. 로컬 파일은 `../pwd-week8-client/README.md`입니다. [클라이언트 실습 안내](https://github.com/ajou-hyunseok-oh/pwd-week8-client/blob/main/README.md)

클라이언트 README **3-1절**에 따라 Supabase **Authentication → URL Configuration**의 Site URL을 `http://127.0.0.1:5173`으로 설정하고 Redirect URLs에 `http://127.0.0.1:5173/auth/callback`을 추가합니다. 로그인 시작부터 복귀까지 같은 브라우저·같은 origin을 사용합니다. Google·네이버 개발자 콘솔에는 Supabase 공급자 화면에서 복사한 `https://본인-ref.supabase.co/auth/v1/callback`을 넣습니다.

## 5. 이메일·Google·네이버로 일반 사용자 권한 확인

세 방식 모두 **가입 또는 로그인 → 새로고침 → 제보 → 권한 확인 → 로그아웃·재로그인**을 진행합니다. 이메일과 Google이 같은 UUID에 연결될 수 있으므로 일반 사용자 실습을 모두 마친 후 6절에서 관리자로 승격합니다.

1. **이메일** — Supabase에서 Email 공급자·신규 가입·이메일 확인을 활성화하고, 앱의 `/#/register`에서 가입합니다. 확인 메일의 링크를 가입할 때 쓴 브라우저 프로필로 엽니다. Supabase 기본 SMTP는 **해당 조직의 팀원으로 등록된 이메일 주소**로만 보냅니다. 학생 본인이 프로젝트를 만든 계정의 등록 이메일을 사용하거나, 다른 주소로 받을 때는 프로젝트에 사용자 지정 SMTP를 설정합니다. `Email address not authorized`는 수신 주소 제한, `429`는 발송 한도에 해당합니다. 확인 후 앱에서 로그아웃하고 `/#/login`에서 같은 이메일과 비밀번호로 로그인합니다. [Supabase 메일 발송 조건](https://supabase.com/docs/guides/auth/auth-smtp)
2. **Google** — 본인 Google Cloud 웹 앱의 Client ID·Secret을 Supabase 기본 Google 공급자에 저장합니다. 앱에서 로그아웃한 뒤 Google 버튼으로 로그인·동의하고 앱 대시보드로 복귀합니다. [클라이언트 3-3절 Google 설정과 로그인](https://github.com/ajou-hyunseok-oh/pwd-week8-client/blob/main/README.md#3-3-google-oauth)
3. **네이버** — 본인 네이버 앱의 PC 웹 서비스 URL·Callback URL·테스트 계정을 등록합니다. 발급한 Client ID·Secret을 서버 `.env`의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`에 입력합니다. 서버 폴더에 **별도 터미널**을 열어 아래 명령을 실행한 뒤 로그아웃 상태에서 네이버로 로그인합니다. 이메일 미제공 계정도 Auth UUID로 연결되며 대시보드에서 표시 이름을 저장할 수 있습니다. [클라이언트 3-4절 네이버 설정과 로그인](https://github.com/ajou-hyunseok-oh/pwd-week8-client/blob/main/README.md#3-4-네이버-custom-oidc)

```bash
npm run auth:setup-naver
npm run auth:check
```

첫 명령은 현재 Supabase 프로젝트에 `custom:naver` 공급자를 등록·갱신합니다. 두 번째는 읽기 전용 점검으로 이메일·Google 활성화, 네이버 OIDC의 issuer·openid·PKCE·이메일 선택 여부 등을 확인합니다. 준비된 프로젝트에서는 모든 값이 `true`이고 종료 코드가 0입니다. 설정을 바꾼 직후에는 최대 60초 뒤 앱에서 **로그인 상태 다시 확인**을 누릅니다. 로그인 성공 여부는 실제 계정으로 복귀한 결과를 확인합니다.

**각 방식의 로그인 직후** 아래 결과를 확인하고 다음 방식으로 넘어갑니다.

- `/#/dashboard`에서 새로고침 후 프로필이 복원됩니다. 개발자 도구 Network에서 `GET /api/auth/me`의 응답 `data.user.id`와 `userType: "user"`를 확인합니다. 같은 UUID의 `public.profiles`와 Supabase **Authentication → Users**에 연결된 identity를 대조합니다.
- `/#/submit`에서 구별할 수 있는 이름을 넣어 맛집을 제보하면 Network의 `POST /api/submissions`가 **201**입니다. `/#/admin`에서는 **접근 권한이 없습니다**가 표시됩니다.
- 로컬 Vite 앱의 개발자 도구 Console에서 아래 두 줄을 실행하면 기존 앱의 API 모듈이 현재 세션을 붙여 요청합니다. 일반 사용자는 **403**, 6절에서 승격한 사용자는 **200**이 표시됩니다. 토큰을 복사하거나 콘솔에 출력할 필요가 없습니다.

```js
const { authAPIService } = await import("/src/services/authApi.js");
await authAPIService.getAllUsers().then(() => 200, error => error.response?.status);
```

로그아웃 후 보호 화면이 차단되는지, 같은 방식으로 다시 로그인하면 UUID와 이전 제보의 `submitter_id`가 일치하는지 확인합니다. 위 요청을 다시 할 때는 Console에서 마지막 줄만 실행합니다. 제출 자료에는 상태 코드와 결과만 기록하고 이메일·토큰·OAuth code는 가립니다.

## 6. 첫 관리자 설정

이메일로 가입한 학생 본인의 계정을 첫 관리자로 사용합니다. **별도 서버 터미널**에서 아래 주소를 실제 가입 이메일로 바꾸어 실행합니다.

```bash
npm run change-user-type -- your-email@example.com admin
```

앱에서 그 계정으로 다시 로그인하거나 새로고침하면 대시보드에 관리자 메뉴가 나타납니다. `/#/admin`의 사용자 관리에서 다른 실습 계정의 역할을 변경할 수 있습니다. 이메일이 없는 네이버 계정은 대시보드에서 지정한 이름과 Auth UUID로 확인합니다. 마지막 활성 관리자는 DB가 보호하므로 역할 해제·계정 비활성화 실습에는 두 번째 실습 계정 또는 10절 자동 검사의 임시 계정을 사용합니다.

## 7. 요청에서 권한 검사까지

1. 클라이언트 Axios 인터셉터가 현재 세션의 액세스 토큰을 읽습니다.
2. `Authorization: Bearer <token>` 헤더로 Express에 전달합니다.
3. `isAuthenticated`가 `auth.getUser(token)`으로 검증합니다.
4. `profiles`를 조회하여 `is_active`와 현재 `user_type`을 확인합니다.
5. 관리자 작업은 `requireAdmin`을 추가로 통과합니다.

클라이언트 `AdminRoute`는 화면 접근을 조절합니다. 최종 API 권한은 서버에서 검사합니다. JWT 내용이나 클라이언트 상태를 편집해 관리자 역할을 얻을 수 없습니다. 역할 변경·비활성화는 기존 액세스 토큰으로 보낸 다음 API 요청에도 반영됩니다.

## 8. API 계약

| 메서드·경로 | 권한 | 결과 |
| --- | --- | --- |
| `GET /health` | 공개 | `{ status: 'ok' }` |
| `GET /api/restaurants` | 공개 | 맛집 목록 |
| `GET /api/restaurants/popular?limit=5` | 공개 | 평점 내림차순, limit 1~50 |
| `GET /api/restaurants/:id` | 공개 | 맛집 상세 |
| `POST /api/restaurants` | 관리자 | 201, 등록한 맛집 |
| `PUT /api/restaurants/:id` | 관리자 | 200, 부분 수정 결과 |
| `DELETE /api/restaurants/:id` | 관리자 | 204 |
| `GET /api/auth/providers` | 공개 | 이메일·Google·네이버의 provider·enabled 값만 반환 |
| `GET /api/auth/me` | 로그인 | `{ success: true, data: { user } }` |
| `GET /api/users/profile` | 로그인 | 현재 프로필 |
| `PUT /api/users/profile` | 로그인 | 본인의 이름·아바타만 수정 |
| `DELETE /api/users/account` | 로그인 | 본인 계정 비활성화 |
| `GET /api/users/all` | 관리자 | `{ success: true, data: { users } }` |
| `PUT /api/users/:userId/type` | 관리자 | `userType: 'user' 또는 'admin'` |
| `POST /api/submissions` | 로그인 | 201, 제보 등록 |
| `GET /api/submissions?status=pending` | 관리자 | 제보 목록 |
| `GET /api/submissions/:id` | 관리자 | 제보 상세 |
| `POST /api/submissions/:id/approve` | 관리자 | 승인 결과 맛집 |
| `PUT /api/submissions/:id` | 관리자 | `status: 'rejected'`로 대기 제보 거절 |
| `DELETE /api/submissions/:id` | 관리자 | 204 |

맛집·제보의 성공 본문은 `{ data: ... }`입니다. 사용자 ID는 UUID `id`이며 기존 MongoDB `_id`를 사용하지 않습니다. 오류 본문에는 `message`와 `error.message`가 있습니다. 비로그인·잘못된 토큰은 401, 권한 부족·비활성 계정은 403, 잘못된 입력은 400, 없는 행은 404, 처리 상태 충돌·마지막 관리자 보호는 409입니다.

7주차의 `/sync-demo`, `/reset-demo`는 8주차 서버에서 제공하지 않습니다. 일반 사용자는 맛집을 직접 등록하는 대신 제보 API를 사용합니다. 좋아요의 브라우저 LocalStorage와 외부 이미지 URL 방식은 이어서 사용합니다.

## 9. 제보 승인 트랜잭션

```text
POST /api/submissions/:id/approve
  → 인증·관리자 확인
  → approve_foodmap_submission(제보 ID, 검증한 관리자 UUID)
  → 제보 행 잠금
  → 맛집 생성 + 제보 승인 상태 저장
```

`restaurants.source_submission_id`의 유일성 제약과 행 잠금으로 같은 제보의 중복 맛집 생성을 막습니다. 이미 승인한 제보를 다시 요청하면 같은 맛집을 반환합니다. 거절된 제보는 승인할 수 없으며, 승인된 제보를 거절할 수 없습니다. 승인된 맛집을 별도로 삭제했다면 재승인은 409입니다.

일반 상태 변경 API에 `approved`를 보내 승인 과정을 우회할 수 없습니다. 제보자 UUID·이름·이메일은 요청 본문 대신 서버가 검증한 계정에서 기록합니다. SQL 함수는 브라우저 역할에 실행 권한이 없습니다.

## 10. 검사

```bash
npm run typecheck
npm test
npm run build
npm run db:check
```

- Jest: 토큰·역할별 HTTP 접근, 비활성 계정, 서비스 입력·응답 계약을 검사합니다.
- PGlite: 로컬 PostgreSQL에서 실제 SQL을 실행해 권한·트리거·중복 승인·롤백·마지막 관리자 보호를 검사합니다. Supabase Auth 전체를 에뮬레이션하는 검사는 아닙니다.
- `db:check`: 실제 프로젝트의 테이블 연결을 읽기로 검사합니다.

다른 사용자가 맛집을 수정하지 않는 시간에 서버 폴더에서 실제 Auth·DB·Express 통합 검사를 실행합니다.

```bash
npm run test:live
```

이 검사는 실제 프로젝트에 임시 Auth 사용자와 테스트 행을 만듭니다. 로그인·갱신·로그아웃, 공개/사용자/관리자 권한, CRUD, 동시 승인, 역할 변경·비활성화를 확인한 뒤 이 실행에서 만든 행과 계정만 정리합니다. 기존 맛집 행을 변경하지 않았는지도 비교합니다. Secret key와 Publishable key가 모두 필요합니다.

브라우저 검사용 계정 두 개와 대기 제보를 남기려면 아래 옵션을 사용합니다.

```bash
npm run test:live -- --keep-fixtures
```

테스트 계정 정보는 Git에서 제외되는 `.env.live-test.local`에 **JSON**으로 저장합니다. 파일이 이미 있으면 그 계정을 사용합니다. dotenv 파일로 읽거나 커밋하지 않습니다. 테스트 계정은 개발 검증용이며 실제 운영 계정으로 사용하지 않습니다.

## 11. 브라우저 실습 확인 순서

1. 이메일·비밀번호, Google, 네이버 세 방식 각각 로그인·새로고침·재로그인 확인
2. 비로그인 상태에서 `/#/admin` 접속 → 로그인 화면
3. 일반 사용자 로그인 → 대시보드, 제보 등록 성공
4. 일반 사용자로 `/#/admin` 접속 → 접근 권한 없음
5. 관리자 로그인 → `/#/admin`에서 맛집 CRUD·사용자 목록 확인
6. `/#/submissions`에서 제보 승인 → 공개 맛집 목록 반영
7. 승인한 행의 승인 버튼은 비활성화됩니다. 중복 요청 시 동일 맛집 한 건을 반환하는지는 10절의 `npm run test:live`에서 확인
8. 사용자 역할 변경 → 해당 사용자의 다음 API 요청에 반영
9. 브라우저 새로고침 → 세션 복원, 서버 재시작 → DB 행 유지
10. 로그아웃 → 관리자·사용자 캐시 제거, 보호 페이지 차단

## 12. 파일과 책임

| 경로 | 책임 |
| --- | --- |
| `server.ts`, `src/app.ts` | 환경변수·서버 시작·CORS·라우터 |
| `src/config/supabase.ts` | 서버 SDK 재사용·DB 오류 변환 |
| `src/middleware/auth.middleware.ts` | 토큰 검증·현재 프로필·관리자 확인 |
| `src/routes`, `src/controllers` | URL·권한·HTTP 응답 |
| `src/services` | 입력 허용 목록·DB 요청·RPC |
| `src/types`, `src/models` | DB/HTTP 타입·필드 변환 |
| `supabase/schema.sql` | 구조·권한·트리거·업무 트랜잭션 |
| `scripts/change-user-type.ts` | 개발자의 최초 관리자 설정 |
| `scripts/verify-live.ts` | 실제 서비스 통합 검사 |

## 13. 배포 설정

1. 본인의 서버·클라이언트 GitHub 저장소에 8주차 소스와 `package-lock.json`, `.env.example`이 있는지 확인합니다. 실제 `.env`, `.env.local`, 실습 계정 파일은 올리지 않습니다.
2. **Render**에서 2절에 중지한 7주차 Web Service의 소스를 본인 8주차 서버 저장소·브랜치로 바꿉니다. Node **24.22.1**, Build **`npm ci --include=dev && npm run build`**, Start **`npm start`**, Health Check Path **`/health`**로 설정합니다. `NODE_ENV=production`이 빌드에도 적용되는 7주차 환경에서 `--include=dev`가 TypeScript와 tsx를 설치합니다. 서버에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_URL=https://실제-클라이언트-도메인`을 등록합니다.
3. **Vercel**에서 8주차 클라이언트 저장소를 연결합니다. Framework **Vite**, Build **`npm run build`**, Output **`dist`**를 사용합니다. Production에 `VITE_API_BASE_URL=https://실제-서버.onrender.com`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`를 설정하고 새 빌드를 배포합니다. API 주소에는 서버 origin만 입력합니다.
4. Render에 Vercel의 실제 origin을 저장하고 8주차 서버를 배포합니다. 별도 Render 서비스를 새로 만들었다면 같은 DB를 쓰는 **옛 7주차 서비스는 중지 상태**로 둡니다. Render의 Live 배포 커밋이 8주차 소스인지, 공개 `/health` 및 `/api/auth/providers`가 응답하는지 확인합니다.
5. Supabase **Authentication → URL Configuration**에 실제 Vercel의 `/auth/callback`을 허용하고 Site URL을 배포 origin으로 지정합니다. 로컬 실습도 계속하면 로컬 복귀 주소도 허용 목록에 둡니다. Google의 앱 origin·네이버 서비스 URL에도 배포 주소를 반영합니다. 배포 앱에서 각 공급자로 로그인해 새로고침한 뒤에도 세션이 유지되는지 확인합니다. 일반 계정으로 제보를 등록하고 관리자 계정으로 이를 승인합니다. Network에서 요청 대상이 본인 Render 주소이고 공개 맛집 목록에 한 건이 추가됐는지 확인합니다.

## 문제 해결

| 증상 | 확인 |
| --- | --- |
| SQL에서 23514, 기존 맛집의 입력 범위 오류 | 2절 사전 점검으로 해당 행을 확인해 수정한 뒤 schema.sql 전체 재실행 |
| Render에서 `tsc: not found` 또는 `tsx: not found` | Build를 `npm ci --include=dev && npm run build`로 저장하고 재배포 |
| `profiles`/`submissions` 없음, RPC를 찾을 수 없음 | 같은 프로젝트에 schema.sql 전체 실행 여부 |
| DB 수정 시 42501 | 서버용 키와 UPDATE GRANT 확인 |
| API 401 | Authorization 헤더, 만료·잘못된 액세스 토큰 |
| API 403 | 프로필의 역할·활성 상태, 비로그인과 구별 |
| 관리자 화면 사용자 목록이 비어 있음 | API 응답 `data.users`, 클라이언트 서비스의 본문 반환 규칙 |
| 가입 후 로그인되지 않음 | 이메일 확인 필요 여부·발송·허용 복귀 URL |
| 다른 사용자 데이터가 화면에 남음 | 로그아웃·사용자 전환 시 React Query 캐시 제거 |
| CORS 오류 | CLIENT_URL의 origin과 실제 브라우저 주소 비교 |
| 승인 409 | 이미 거절·삭제된 맛집에 연결된 승인 제보인지 확인 |

참고: [Supabase Auth](https://supabase.com/docs/guides/auth), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [사용자 프로필](https://supabase.com/docs/guides/auth/managing-user-data), [API 키](https://supabase.com/docs/guides/getting-started/api-keys), [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Custom OAuth](https://supabase.com/docs/guides/auth/custom-oauth-providers).
