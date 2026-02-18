### REBAR INPUT

```javascript
{
  id: "SMART_REBAR_01", 
  code: 44,        // 철근 shape code - BS8666
  x: "-WEB_X",     // 철근 생성 시 x
  y: "BOTTOM_Y",   // 철근 생성 시 y

  // 1. 단수 (Scalar) : 철근 세그먼트의 초기 생성 시 회전
  rot: 10,

  // 2. 복수 (Collections - s)
  dims: { A: 500, B: 1800, C: 400, D: 1800, E: 500 },
  angs: { RA: 90, RB: 90, RC: 90, RD: 90 },
  nors: { A: 1, B: -1, C: -1, D: -1, E: 1 },

  // 3. 단부 처리 (Begin / End, FIT / RAY 도입!)
  // fit: 벽체 끝까지 연장, ray: 철근 축방향으로 만나는 벽까지 (+ 값은 늘림, - 값은 줄임)
  // ⭐ 혁신적인 Ends 입력 방식
    Ends: { 
        b: { "fit": 0 },    // 소문자 b, fit 가능
        E: { "RAY": -40 }   // 대문자 E, RAY 가능 (type/val 삭제)
    }
}
