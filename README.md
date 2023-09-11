# step-api-spec
스텝페이 API Spec을 service별, gateway별로 확인하기 위한 서비스

## 주요 명령어 사용법

```bash
chmod +x run.sh
./run.sh
```bash

```bash
npm install
APP_ENV=production yarn fetch
API_SEGMENT=v1 yarn combine
API_SPEC_FILE=merged_v1 yarn build
```

- APP_ENV
    - develop
    - staging
    - production
- API_SEGMENT
    - v1
    - public
    - manager
    - customer
    - internal
    - admin
    - payment
- API_SPEC_FILE
    - merged_v1
    - merged_public
    - merged_manager
    - merged_customer
    - merged_internal
    - merged_admin
    - merged_payment


## swagger ui 확인

```bash
node ./src/server.mjs
```

```text
http://localhost:3000/swagger
```