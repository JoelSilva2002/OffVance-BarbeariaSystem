/** Corpo de erro RFC 9457 que toda a API devolve — o código de máquina vive em `title`, nunca em `code`. */
export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class ApiError extends Error {
  status: number;
  title: string;
  detail?: string;

  constructor(problem: ProblemBody) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.title = problem.title;
    this.detail = problem.detail;
  }
}
