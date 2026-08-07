require('dotenv').config();

async function checkAvailableModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        // 구글 서버에 현재 사용 가능한 모델 목록 요청
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        console.log("=== 🟢 현재 사용 가능한 모델 목록 ===");
        data.models.forEach(model => {
            // 텍스트 생성이 가능한 모델만 필터링해서 보여주기
            if (model.supportedGenerationMethods.includes("generateContent")) {
                // 우리가 코드에 입력해야 할 이름만 깔끔하게 출력
                console.log(model.name.replace('models/', '')); 
            }
        });
        console.log("=====================================");
    } catch (error) {
        console.error("목록을 불러오는 데 실패했습니다:", error);
    }
}

checkAvailableModels();