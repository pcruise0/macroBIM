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
  ends: {
    B: { type: "FIT", val: 0 },   // Begin: 벽 끝에 딱 맞춤
    E: { type: "RAY", val: -40 }  // End: 광선(Ray) 쏘고 피복만큼 후퇴
  }
}
