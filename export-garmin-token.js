require('dotenv').config();
const fs = require('fs');
const { GarminConnect } = require('garmin-connect');
const { cleanEnv } = require('./env');

async function main() {
    const gcClient = new GarminConnect({
        username: cleanEnv('GARMIN_USERNAME'),
        password: cleanEnv('GARMIN_PASSWORD')
    });

    await gcClient.login();

    const tokens = gcClient.exportToken();
    const json = JSON.stringify(tokens);

    // 토큰 JSON(oauth1 + oauth2)을 stdout으로 출력 — 사용자가 GitHub Secret에 붙여넣을 원본.
    console.log(json);

    // 🚨 public repo 보호: env(GARMIN_TOKEN_OUTPUT)가 지정된 경우 레포 밖 안전 경로로도 저장.
    const outputPath = process.env.GARMIN_TOKEN_OUTPUT;
    if (outputPath) {
        fs.writeFileSync(outputPath, json, 'utf8');
    }

    process.exit(0);
}

main().catch((err) => {
    // 🚨 토큰 값은 출력하지 않음 — 에러 메시지만 표시.
    console.error('❌ 토큰 export 실패:', err.message);
    process.exit(1);
});
