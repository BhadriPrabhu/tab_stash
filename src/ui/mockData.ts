export const MOCK_TABS = Array.from({ length: 12 }, (_, i) => ({
  id: `tab-${i}`,
  url: `https://example${i}.com/page`,
  title: i % 3 === 0 
    ? `Long tab title that should be truncated with an ellipsis because it exceeds the available space ${i}`
    : `Example Site ${i} - Dashboard`,
  domain: `example${i}.com`
}));

export const MOCK_STASHES = [
  {
    id: '1',
    name: 'Some Project',
    tabCount: 3,
    tabs: [
      { id: 't1', u: 'https://airtable.com/table/123456', t: 'Airtable.com', domain: 'Airtable.com' },
      { id: 't2', u: 'https://dropbox.com/file/spec/pdf', t: 'Dropbox', domain: 'Dropbox' },
      { id: 't3', u: 'https://example.com', t: 'Hidden tab', domain: 'Example' }
    ]
  },
  {
    id: '2',
    name: 'Work tools',
    tabCount: 2,
    tabs: [
      { id: 't4', u: 'https://zapier.com/automation/1234', t: 'Zapier.com', domain: 'Zapier.com' },
      { id: 't5', u: 'https://github.com/pulls', t: 'Github.com - Last edited Aug 18', domain: 'Github.com' }
    ]
  },
  {
    id: '3',
    name: 'Empty Group Example',
    tabCount: 0,
    tabs: []
  }
];