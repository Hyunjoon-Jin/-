/**
 * node:sqlite 최소 타입 선언.
 * 설치된 @types/node 버전이 아직 node:sqlite를 포함하지 않아 보강한다.
 * (런타임은 Node 22 내장 모듈로 정상 동작 — 테스트로 검증됨.)
 */
declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
