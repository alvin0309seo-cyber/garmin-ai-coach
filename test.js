const { GarminConnect } = require('garmin-connect');

async function testMethods() {
    try {
        const gcClient = new GarminConnect({
            // 🚨 여기에 본인의 진짜 가민 이메일과 비밀번호를 다시 적어주세요!
            username: 'alvin0309.seo@gmail.com',
            password: '!Kh030900'
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