# step-api-spec
스텝페이 API Spec을 service별, gateway별로 확인하기 위한 서비스

## Requirement
- npm
- yarn

```bash
brew install node
npm install --global yarn
```

## 주요 명령어 사용법

- 전체 실행하기

```bash
chmod +x run.sh
./run.sh
```

- 서비스 별로 실행하기

```bash
npm install
APP_ENV=production yarn fetch
API_SEGMENT=v1 yarn combine
API_SEGMENT=v1 yarn stoplight
API_SPEC_FILE=v1 yarn build
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
    - v1
    - public
    - manager
    - customer
    - internal
    - admin
    - payment


## swagger ui 확인

```bash
node ./src/server.mjs
```

```text
http://localhost:3000/swagger
```

## 기타

### Spec Validate Skip
- org.openapitools.codegen.SpecValidationException 날 때 임시 조치
- package.json에서 build 옵션에 `--skip-validate-spec` 추가

```text
"build": "openapi-generator-cli generate -i merge/$API_SPEC_FILE.json -g typescript-axios -o ../step-api-sdk --remove-operation-id-prefix --additional-properties=ngVersion=6.1.7,npmName=step-api-sdk,supportsES6=true,npmVersion=1.0.0,withInterfaces=true"
```
