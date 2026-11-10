export type TabColor = "blue" | "red" | "yellow" | "green" | "pink" | "cyan" | "orange" | "grey";

export interface TabRecord {
  u: string;  // url
  t: string;  // title
  p: boolean; // pinned
  g: number;  // tab-group id (-1 for none)
}

export interface GroupRecord {
  i: number;
  title: string;
  color: string;
  collapsed: boolean;
}

export interface StashIndexEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tabCount: number;
  store: "sync" | "local";
  chunks: number;
  color: TabColor;
  deleted?: boolean; // For soft-delete/undo
}

export interface StashIndex {
  v: 1;
  stashes: StashIndexEntry[];
}