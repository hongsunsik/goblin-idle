// index.html이 불러오는 내 파일(style.css, *.js)의 주소 뒤에 버전(?v=시각)을 붙이거나 갱신한다: node tools/bump-version.js
// 브라우저(특히 휴대폰)는 파일을 한동안 저장해 두고 다시 받지 않아서, 업데이트해도 예전 화면이 남아 있는 일이 생긴다.
// 주소가 바뀌면 새 파일을 받으므로, 배포(커밋) 직전에 실행한다. 바깥 주소(CDN)는 건드리지 않는다.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const version = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
let n = 0;
const html = fs.readFileSync(file, 'utf8').replace(/(<script src="|<link rel="stylesheet" href=")((?!https?:)[^"?]+\.(?:js|css))(\?v=[^"]*)?"/g, (m, head, url) => {
  n += 1;
  return `${head}${url}?v=${version}"`;
});
fs.writeFileSync(file, html);
console.log(`index.html의 파일 ${n}개에 버전 ${version}을 붙였어요.`);
