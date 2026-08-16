require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 아까 작성했던 데이터 수집기들 불러오기
const { getGarminData } = require('./garmin');
const { getBaseRecommendation } = require('./rule');
const { getAiRecommendation } = require('./ai');

// 사용자님의 Supabase 창고 열쇠
const supabaseUrl = process.env.SUPABASE_URL || 'https://pusjqsqkadloaqfuiqqn.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadToDatabase() {
    try {
        console.log("🏃‍♂️ 1. 가민에서 진짜 내 데이터 가져오는 중...");
        const garminData = await getGarminData(); 
        
        console.log("🧠 2. 추천 로직 및 AI 코치 계획 생성 중...");
        const recommendation = getBaseRecommendation(garminData);
        const aiPlan = await getAiRecommendation(garminData, recommendation);

        // 가민 데이터 날짜(KST 기준)와 일치시킴
        const today = garminData.date;

        console.log(`📦 3. Supabase 창고에 안전하게 보관 중... (기준일: ${today})`);
        const { data, error } = await supabase
            .from('daily_plans')
            .upsert([
                { 
                    date: today, 
                    garmin_data: garminData, 
                    system_rule: recommendation, 
                    ai_coach: aiPlan 
                }
            ], { onConflict: 'date' });

        if (error) throw error;
        console.log("🎉 성공! 데이터가 DB에 완벽하게 저장되었습니다.");
        process.exit(0); // 작업 완료 후 알아서 깔끔하게 종료
        
    } catch (error) {
        console.error("❌ 에러 발생:", error);
        process.exit(1);
    }
}

uploadToDatabase();