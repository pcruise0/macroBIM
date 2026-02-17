// =========================================================================
//  equation.js - Parametric Equation Parser (v01)
// =========================================================================

const EquationParser = {
    // 단일 수식 변환 (expr: 수식 문자열, paramsObj: 치환할 변수 딕셔너리)
    eval: (expr, paramsObj) => {
        if (typeof expr === "number") return expr;
        if (typeof expr !== "string") return 0;

        let parsedStr = expr;
        
        // paramsObj에 등록된 변수명을 실제 숫자로 치환
        for (const key in paramsObj) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            parsedStr = parsedStr.replace(regex, paramsObj[key]);
        }

        try {
            // 수학 엔진 가동 (** 연산자는 기본 지원, 삼각함수는 Degree 기준 래핑)
            const mathContext = `
                const sin = (deg) => Math.sin(deg * Math.PI / 180);
                const cos = (deg) => Math.cos(deg * Math.PI / 180);
                const tan = (deg) => Math.tan(deg * Math.PI / 180);
                const sqrt = Math.sqrt;
            `;
            return new Function(`${mathContext} return ${parsedStr};`)();
        } catch (e) {
            console.error(`[EquationParser Error] 수식 계산 실패: ${expr} -> ${parsedStr}`);
            return 0;
        }
    },

    // dims 객체 내의 모든 치수를 한꺼번에 파싱
    evalDims: (dimsObj, paramsObj) => {
        let result = {};
        for (let key in dimsObj) {
            result[key] = EquationParser.eval(dimsObj[key], paramsObj);
        }
        return result;
    }
};
