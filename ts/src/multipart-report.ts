import type { MimeVisitor } from './mime-visitor.js';
import type { MimeEntityConstructorArgs } from './mime-entity.js';
import { Multipart } from './multipart.js';

export class MultipartReport extends Multipart {
  constructor(args: MimeEntityConstructorArgs);
  constructor(reportType: string, ...args: unknown[]);
  constructor(reportType: string | MimeEntityConstructorArgs, ...args: unknown[]) {
    if (isConstructorArgs(reportType)) {
      super(reportType);
      return;
    }
    if (reportType == null) throw new TypeError('reportType cannot be null or undefined');
    super('report', ...args);
    this.reportType = reportType;
  }

  get ReportType(): string | null { return this.reportType; }
  set ReportType(value: string | null) { this.reportType = value; }
  get reportType(): string | null {
    return this.contentType.parameters.get('report-type') as string | null;
  }
  set reportType(value: string | null) {
    if (value == null) throw new TypeError('value cannot be null or undefined');
    if (this.reportType === value)
      return;
    this.contentType.parameters.set('report-type', value.trim());
  }

  override accept(visitor: MimeVisitor): void {
    if (visitor == null) throw new TypeError('visitor cannot be null or undefined');
    this.checkDisposed('MultipartReport');
    visitor.visitMultipartReport(this);
  }
}

function isConstructorArgs(value: unknown): value is MimeEntityConstructorArgs {
  return typeof value === 'object' && value !== null && 'parserOptions' in value && 'contentType' in value && 'headers' in value;
}
