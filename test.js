require('dotenv').config();
const { GarminConnect } = require('garmin-connect');

async function testMethods() {
    try {
        const gcClient = new GarminConnect({
            username: process.env.GARMIN_USERNAME,
            password: process.env.GARMIN_PASSWORD
        });
        
        await gcClient.login();
        console.log("🎉 로그인 성공! 사용 가능한 함수 목록을 조사합니다...\n");
        
        // gcClient가 가지고 있는 모든 숨겨진 함수 이름들을 강제로 출력하는 마법의 코드
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(gcClient));
        console.log(methods);

    } catch (error) {
        console.log("❌ 오류 발생:", error.message);
    }
}

testMethods();