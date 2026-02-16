/* FUNCTION SUMMARY

   geo_length
   geo_angle
   get_inner_angle
   geo_chamfer
   geo_fillet
   geo_offset
   geo_intersect
   geo_rotatePt2D

*/


// 두 점 사이의 거리 계산 (2D/3D 대응)
function geo_length(p1, p2) {
  var dx = p2.x - p1.x;
  var dy = p2.y - p1.y;
  var dz = (p2.z || 0) - (p1.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// p1에서 p2를 바라보는 각도 계산 (Degree)
function geo_angle(p1, p2) {
  var dL = geo_length(p1, p2);
  if (dL === 0) return 0;

  var angle = Math.asin((p2.y - p1.y) / dL) * 180 / Math.PI;

  if ((p2.x - p1.x) < 0) {
    return 180 - angle;
  } else {
    return angle;
  }
}

// 두 벡터 사이의 내각 계산 (기존 vector_inner_angle 대체용 예시)
function get_inner_angle(p1, p2, p3) {
  var d12 = geo_length(p1, p2);
  var d23 = geo_length(p3, p2);
  var dotProduct = (p1.x - p2.x) * (p3.x - p2.x) + (p1.y - p2.y) * (p3.y - p2.y) + ((p1.z || 0) - (p2.z || 0)) * ((p3.z || 0) - (p2.z || 0));
  return Math.acos(dotProduct / (d12 * d23)) * 180 / Math.PI;
}

// 모따기(Chamfer) 계산
function geo_chamfer(p1, p2, p3, dL_chamfer) {

  var dl_vec1 = geo_length(p1, p2);
  var dl_vec2 = geo_length(p3, p2);

  // 결과 객체 생성
  return {

      xb: p2.x + (dL_chamfer / dl_vec1) * (p1.x - p2.x),
      yb: p2.y + (dL_chamfer / dl_vec1) * (p1.y - p2.y),
      //ze: 0, //(p2.z || 0) + (dL_chamfer / dl_vec1) * ((p1.z || 0) - (p2.z || 0))
      xe: p2.x + (dL_chamfer / dl_vec2) * (p3.x - p2.x),
      ye: p2.y + (dL_chamfer / dl_vec2) * (p3.y - p2.y),
      //ze: 0,//(p2.z || 0) + (dL_chamfer / dl_vec2) * ((p3.z || 0) - (p2.z || 0))
  };
}

// 필렛(Fillet) 계산
function geo_fillet(p1, p2, p3, dradii) {
  var iccw = geo_rotation(p1, p2, p3);
  var dtheta = get_inner_angle(p1, p2, p3) / 2.0;
  
  var dl_vec1 = geo_length(p1, p2);
  var dl_vec2 = geo_length(p3, p2);

  // 접선까지의 거리 (Tangent Length)
  var dTL = dradii / Math.tan(dtheta * Math.PI / 180.0);

  // 접점 r1, r2 계산
  var r1 = {
    x: p2.x + (dTL / dl_vec1) * (p1.x - p2.x),
    y: p2.y + (dTL / dl_vec1) * (p1.y - p2.y),
    //z: (p2.z || 0) + (dTL / dl_vec1) * ((p1.z || 0) - (p2.z || 0))
  };

  var r2 = {
    x: p2.x + (dTL / dl_vec2) * (p3.x - p2.x),
    y: p2.y + (dTL / dl_vec2) * (p3.y - p2.y),
    //z: (p2.z || 0) + (dTL / dl_vec2) * ((p3.z || 0) - (p2.z || 0))
  };

  // 현의 중점
  var rm = {
    x: (r1.x + r2.x) / 2,
    y: (r1.y + r2.y) / 2,
    //z: (r1.z + r2.z) / 2
  };

  // 원의 중심까지의 거리 및 중심 좌표(xc, yc, zc) 계산
  var dpt2tocen = Math.sqrt(dTL * dTL + dradii * dradii);
  var ddiag = geo_length(p2, rm);

  var center = {
    x: p2.x + (rm.x - p2.x) * dpt2tocen / ddiag,
    y: p2.y + (rm.y - p2.y) * dpt2tocen / ddiag,
    //z: (p2.z || 0) + (rm.z - (p2.z || 0)) * dpt2tocen / ddiag
  };

  // 시작 각도 결정
  var startAngle = (iccw === -1) ? geo_angle(center, r1) : geo_angle(center, r2);
  var endAngle = (iccw === -1) ? geo_angle(center, r2) : geo_angle(center, r1);
  
// ⭐ 각도 보정 로직 추가 ⭐
  // CCW(반시계 방향)로 항상 증가하도록 보정
  if (endAngle <= startAngle) {
    endAngle += 360;
  }

  // 만약 너무 한 바퀴를 도는 각도가 나왔다면 (내각이므로 180도를 넘을 수 없음)
  // 필렛 내각은 항상 180도 미만이므로 아래와 같은 추가 보정이 필요할 수 있습니다.
  if (endAngle - startAngle > 180) {
      // 이 경우는 방향이 뒤집힌 경우이므로 상황에 맞게 조정
      // (일반적인 필렛에서는 발생하지 않으나 각도 계산 라이브러리 특성에 따라 필요할 수 있음)
  }

  return {
    ox: center.x ,
    oy: center.y ,
    r: dradii,
    angb: startAngle,
    ange: endAngle,
    xb: r1.x,
    yb: r1.y,
    xe: r2.x,
    ye: r2.y,
    //dir: iccw // -1: CCW, 1: CW
  };
  
}



/*
  2025.12.24 생성
*/
/**
 * @param {Object} p1 - {x, y} 시작점
 * @param {Object} p2 - {x, y} 끝점
 * @param {number} doffset - 오프셋 거리 (양수: 오른쪽, 음수: 왼쪽)
 * @returns {Object} {p1: {x, y}, p2: {x, y}}
 */
function geo_offset(p1, p2, doffset) {
    var x1 = p1.x, y1 = p1.y;
    var x2 = p2.x, y2 = p2.y;
    var dang;

    // 1. 각도 계산 (수직/수평 예외 처리 및 방향 정규화)
    if (Math.abs(x2 - x1) <= 1e-10) {
        // 수직선
        dang = 90;
        // 항상 아래쪽에서 위쪽 방향으로 기준을 잡기 위한 처리
        var start = { x: x1, y: y1 };
        var end = { x: x2, y: y2 };

        if (y2 <= y1) {
            start = { x: x2, y: y2 };
            end = { x: x1, y: y1 };
        }
      
        x1 = start.x; y1 = start.y;
        x2 = end.x; y2 = end.y;
      
    } else if (Math.abs(y2 - y1) <= 1e-10) {
        // 수평선
        dang = 0;
        // 항상 왼쪽에서 오른쪽 방향으로 기준을 잡기 위한 처리
        var start = { x: x1, y: y1 };
        var end = { x: x2, y: y2 };

        if (x2 <= x1) {
            start = { x: x2, y: y2 };
            end = { x: x1, y: y1 };
        }
      
        x1 = start.x; y1 = start.y;
        x2 = end.x; y2 = end.y;
      
    } else {
        // 항상 왼쪽에서 오른쪽 방향으로 기준을 잡기 위한 처리
        var start = { x: x1, y: y1 };
        var end = { x: x2, y: y2 };

        if (x2 <= x1) {
            start = { x: x2, y: y2 };
            end = { x: x1, y: y1 };
        }
        // 이전에 변환해둔 geo_angle 함수 사용
        dang = geo_angle(start, end);
        
        // 정규화된 좌표를 결과에 반영하기 위해 업데이트
        x1 = start.x; y1 = start.y;
        x2 = end.x; y2 = end.y;
    }

    // 2. 오프셋 방향 설정 (오른쪽: 90도, 왼쪽: -90도)
    //    x1 -> x2 방향으로 오른손 법칙 : 반시계방향 +
    if (doffset >= 0) {
        dang += 90;
    } else {
        dang -= 90;
    }

    var absOffset = Math.abs(doffset);
    var rad = dang * Math.PI / 180;
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);

    // 3. 결과 반환 (이동된 두 점)
    return {
            x1: x1 + absOffset * cosR,
            y1: y1 + absOffset * sinR,
            x2: x2 + absOffset * cosR,
            y2: y2 + absOffset * sinR
    };
}

/**
 * @param {Object} p11, p12 - 첫 번째 선의 두 점
 * @param {Object} p21, p22 - 두 번째 선의 두 점
 * @returns {Object|null} {x, y, z} 교점 좌표 (평행할 경우 null)
 */
function geo_intersect(p11, p12, p21, p22) {
    var dx1 = p12.x - p11.x;
    var dy1 = p12.y - p11.y;
    var dx2 = p22.x - p21.x;
    var dy2 = p22.y - p21.y;

    // 분모 계산 (행렬식)
    var denominator = dy2 * dx1 - dx2 * dy1;

    // 평행 여부 판단 (분모가 0에 가까우면 평행)
    if (Math.abs(denominator) <= 1e-10) {
        console.warn("Parallel Lines, can't find intersect point!");
        return null;
    }

    // 매개변수 t 계산
    var dt = (dx2 * (p11.y - p21.y) + dy2 * (p21.x - p11.x)) / denominator;

    // 교점 반환
    return {
        x: p11.x + dt * dx1,
        y: p11.y + dt * dy1,
    };
}


/** 2026.01.02
 * @param {number} x - 회전할 점의 X 좌표
 * @param {number} y - 회전할 점의 Y 좌표
 * @param {number} cx - 회전 기준점 X
 * @param {number} cy - 회전 기준점 Y
 * @param {number} angle - 회전 각도 (Degree)
 * @returns {Object} {x, y} - 회전된 좌표
 */
function geo_rotatePt2D(p1, p0, angle) {
    if (angle === 0) return { x: p1.x, y: p1.y };
    
    const rad = angle * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    // 기준점을 원점으로 이동시킨 후 회전 연산
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    
    const nx = dx * cos - dy * sin + p0.x;
    const ny = dx * sin + dy * cos + p0.y;
    
// 4. 결과 반환
    return { x: nx, y: ny };
}
