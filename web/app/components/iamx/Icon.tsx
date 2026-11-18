"use client";

// ชื่อ (IconName) คงเดิม จอที่ใช้ <Icon name=…> ไม่ต้องแก้
import { RecentlyViewed,
  Search, Add, Edit, TrashCan, OverflowMenuHorizontal, OverflowMenuVertical, Close, Checkmark,
  ChevronRight, ChevronDown, ChevronLeft, ChevronSort, Filter,
  Download, Upload, Copy, User, UserMultiple, Security, Earth, Grid,
  Layers, List, Flow, Chat, Settings, Notification, Help,
  Folder, Document, Box, View, ViewOff, Renew, ArrowUp, ArrowDown,
  ArrowsVertical, Star, Locked, Password, Email, Calendar, Information, Warning,
  Map, Location, Wallet, ChartLineSmooth, ShoppingCart, Menu, Dashboard,
  Radio, SidePanelOpen, Keyboard, Logout, Maximize, Minimize, Sun, Moon, UserAdmin, Power, Portfolio, Home,
} from "@carbon/icons-react";

const MAP = {
  activity: RecentlyViewed, search: Search, plus: Add, edit: Edit, trash: TrashCan, more: OverflowMenuHorizontal,
  moreV: OverflowMenuVertical, x: Close, check: Checkmark, chevronRight: ChevronRight,
  chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronUpDown: ChevronSort,
  filter: Filter, download: Download, upload: Upload, copy: Copy, user: User,
  users: UserMultiple, shield: Security, globe: Earth, grid: Grid, layers: Layers,
  list: List, workflow: Flow, chat: Chat, settings: Settings,
  bell: Notification, help: Help, folder: Folder, fileText: Document, box: Box,
  eye: View, eyeOff: ViewOff, power: Power, refresh: Renew, arrowUp: ArrowUp, arrowDown: ArrowDown,
  sort: ArrowsVertical, star: Star, lock: Locked, key: Password, mail: Email,
  calendar: Calendar, info: Information, alert: Warning, map: Map, pin: Location,
  wallet: Wallet, trending: ChartLineSmooth, shopping: ShoppingCart, doc: Document,
  menu: Menu, block: Dashboard, radio: Radio, panel: SidePanelOpen,
  command: Keyboard, logout: Logout, expand: Maximize, contract: Minimize,
  sun: Sun, moon: Moon, crown: UserAdmin, briefcase: Portfolio, home: Home,
} as const;

export type IconName = keyof typeof MAP;

export function Icon({
  name, size = 16, className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** ไม่ใช้แล้ว (ไอคอน Carbon เป็นรูปทึบ ความหนาคงที่) — คงไว้ให้โค้ดเดิมคอมไพล์ผ่าน */
  strokeWidth?: number;
}) {
  const Cmp = MAP[name] ?? Information;
  return <Cmp size={size} className={className} aria-hidden />;
}

/** คอมโพเนนต์ไอคอน Carbon ตามชื่อ — ใช้กับ renderIcon ของ @carbon/react */
export function carbonIcon(name: IconName) {
  return MAP[name] ?? Information;
}
