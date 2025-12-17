import { ChangeRecord, ChangeType, ActionType, CommitStatus, DailyStat } from './types';

export const MOCK_DAILY_STATS: DailyStat[] = [
  { date: '2023-10-20', changes: 12 },
  { date: '2023-10-21', changes: 8 },
  { date: '2023-10-22', changes: 15 },
  { date: '2023-10-23', changes: 5 },
  { date: '2023-10-24', changes: 22 },
  { date: '2023-10-25', changes: 18 },
  { date: '2023-10-26', changes: 9 },
];

export const MOCK_CHANGES: ChangeRecord[] = [
  {
    id: 'chg-001',
    timestamp: '2023-10-26T14:30:00Z',
    admin: 'jdoe',
    deviceGroup: 'DG-Corporate-Firewalls',
    type: ChangeType.SECURITY_POLICY,
    action: ActionType.EDIT,
    description: 'Modified "Allow-Web-Access" rule to include new proxy servers.',
    status: CommitStatus.SUCCESS,
    diffBefore: `<entry name="Allow-Web-Access">
  <to>
    <member>untrust</member>
  </to>
  <from>
    <member>trust</member>
  </from>
  <source>
    <member>any</member>
  </source>
  <destination>
    <member>any</member>
  </destination>
  <service>
    <member>service-http</member>
    <member>service-https</member>
  </service>
  <action>allow</action>
</entry>`,
    diffAfter: `<entry name="Allow-Web-Access">
  <to>
    <member>untrust</member>
  </to>
  <from>
    <member>trust</member>
  </from>
  <source>
    <member>10.10.50.0/24</member> <!-- RESTRICTED TO PROXY SUBNET -->
  </source>
  <destination>
    <member>any</member>
  </destination>
  <service>
    <member>service-http</member>
    <member>service-https</member>
    <member>service-8080</member> <!-- ADDED 8080 -->
  </service>
  <action>allow</action>
</entry>`
  },
  {
    id: 'chg-002',
    timestamp: '2023-10-26T11:15:00Z',
    admin: 'asmith',
    deviceGroup: 'DG-DataCenter-East',
    type: ChangeType.OBJECT,
    action: ActionType.ADD,
    description: 'Added new Database Server object for HR App.',
    status: CommitStatus.SUCCESS,
    diffBefore: `<!-- No previous entry -->`,
    diffAfter: `<entry name="HR-DB-01">
  <ip-netmask>192.168.100.55/32</ip-netmask>
  <tag>
    <member>HR-Prod</member>
    <member>PCI-Scope</member>
  </tag>
</entry>`
  },
  {
    id: 'chg-003',
    timestamp: '2023-10-25T16:45:00Z',
    admin: 'system-API',
    deviceGroup: 'Shared',
    type: ChangeType.SYSTEM,
    action: ActionType.EDIT,
    description: 'Updated DNS Server settings.',
    status: CommitStatus.FAILURE,
    diffBefore: `<dns-setting>
  <server>
    <member>8.8.8.8</member>
  </server>
</dns-setting>`,
    diffAfter: `<dns-setting>
  <server>
    <member>1.1.1.1</member> <!-- INVALID CONFIG DETECTED -->
  </server>
</dns-setting>`
  },
  {
    id: 'chg-004',
    timestamp: '2023-10-25T09:20:00Z',
    admin: 'bwayne',
    deviceGroup: 'DG-Guest-Wifi',
    type: ChangeType.SECURITY_POLICY,
    action: ActionType.DELETE,
    description: 'Removed temporary rule for vendor access.',
    status: CommitStatus.SUCCESS,
    diffBefore: `<entry name="Vendor-Temp-Access">
  <action>allow</action>
  <description>Temporary access for ACME Corp support until 10/25</description>
</entry>`,
    diffAfter: `<!-- DELETED -->`
  }
];