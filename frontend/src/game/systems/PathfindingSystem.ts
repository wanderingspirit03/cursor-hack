import EasyStar from 'easystarjs';
import { isoToScreen } from '../constants';

export interface Point {
  x: number;
  y: number;
}

export class PathfindingSystem {
  private easystar: EasyStar.js;
  private cols = 0;
  private rows = 0;

  constructor() {
    this.easystar = new EasyStar.js();
    this.easystar.setAcceptableTiles([0]);
    this.easystar.enableDiagonals();
    this.easystar.disableCornerCutting();
  }

  setGrid(grid: number[][], cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.easystar.setGrid(grid);
  }

  /** Find path between two grid coordinates, returns screen positions */
  findPath(startCol: number, startRow: number, endCol: number, endRow: number): Promise<Point[]> {
    const sc = Math.max(0, Math.min(startCol, this.cols - 1));
    const sr = Math.max(0, Math.min(startRow, this.rows - 1));
    const ec = Math.max(0, Math.min(endCol, this.cols - 1));
    const er = Math.max(0, Math.min(endRow, this.rows - 1));

    return new Promise((resolve) => {
      this.easystar.findPath(sc, sr, ec, er, (path) => {
        if (path) {
          resolve(
            path.map((p) => isoToScreen(p.x, p.y))
          );
        } else {
          resolve([]);
        }
      });
      this.easystar.calculate();
    });
  }

  isWalkable(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }
}
