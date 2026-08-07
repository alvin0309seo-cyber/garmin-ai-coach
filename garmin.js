require('dotenv').config();
const { GarminConnect } = require('garmin-connect');

async function getGarminData() {
    try {
        const gcClient = new GarminConnect({
            username: process.env.GARMIN_USERNAME,
            password: process.env.GARMIN_PASSWORD
        });
        
        await gcClient.login(); 
        console.log("가민 로그인 성공!");

        // 🚨 글씨가 아닌 진짜 '날짜(Date) 객체'를 만듭니다.
        const today = new Date();
        
        // 화면에 보여주기 위한 텍스트(YYYY-MM-DD) 만들기
        const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000)); 
        const dateString = kstDate.toISOString().split('T')[0];

        // 🚨 핵심 수정: dateString(글씨) 대신 today(날짜 객체)를 통째로 집어넣습니다!
        const sleepData = await gcClient.getSleepData(today);
        const heartRateData = await gcClient.getHeartRate(today);

        return {
            date: dateString,
            bodyBattery: 50, 
            sleepScore: sleepData?.dailySleepDTO?.sleepScore || 50,
            restingHeartRate: heartRateData?.restingHeartRate || 60
        };

    } catch (error) {
        console.error("가민 데이터를 가져오는 중 오류 발생:", error.message);
        throw error;
    }
}

module.exports = { getGarminData };