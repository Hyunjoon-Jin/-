/**
 * 렌더러 조립: packages/app/dist → packages/desktop/renderer
 * 패키징 시 렌더러를 desktop 패키지 안에 포함시키기 위함(모노레포 sibling 참조 회피).
 * 순수 Node(의존성 없음).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDist = join(here, '..', '..', 'app', 'dist');
const dest = join(here, '..', 'renderer');

if (!existsSync(appDist)) {
  console.error('렌더러 빌드가 없습니다. 먼저 실행: npm run build --workspace @soccer-tycoon/app');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(appDist, dest, { recursive: true });
console.log(`렌더러 조립 완료: ${appDist} → ${dest}`);
