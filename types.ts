export enum ChangeType {
  SECURITY_POLICY = 'Security Policy',
  NAT_POLICY = 'NAT Policy',
  OBJECT = 'Address Object',
  NETWORK = 'Network Interface',
  SYSTEM = 'System Config'
}

export enum ActionType {
  ADD = 'Add',
  EDIT = 'Edit',
  DELETE = 'Delete'
}

export enum CommitStatus {
  SUCCESS = 'Success',
  FAILURE = 'Failure',
  PENDING = 'Pending'
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'added' | 'removed' | 'unchanged';
}

export interface ChangeRecord {
  id: string;
  timestamp: string; // ISO String
  admin: string;
  deviceGroup: string;
  type: ChangeType;
  action: ActionType;
  description: string;
  status: CommitStatus;
  diffBefore: string;
  diffAfter: string;
}

export interface DailyStat {
  date: string;
  changes: number;
}
