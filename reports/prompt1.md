Read @docs/PRD.md and @docs/SRS.md (device/breakpoint section) before starting.

TASK: Build ONLY the design system and app shell for the Champions Club Management System frontend. No feature screens yet.

STACK (pinned, do not change or add libraries): React 18, TypeScript, Vite, Tailwind CSS 3.4, React Router, TanStack React Query v5, lucide-react for icons, clsx. No UI component libraries (no MUI, Chakra, shadcn).

VISUAL STYLE (match a modern soft-UI dashboard):

- Page canvas: light cool grey-blue (#E8ECF3). The app sits inside a large rounded container (rounded-[32px]) with a soft border.
- Cards: white, rounded-3xl, very soft shadow, generous padding. No harsh borders.
- Floating left icon rail: narrow, white, rounded-full pill with vertical icon buttons; active item has a soft raised background.
- Top bar: pill-shaped nav tabs (active tab is lightly tinted blue), search icon button, avatar stack with "+N" bubble, primary pill button, user avatar and notification bell.
- Accent palette: blue (#3B82F6) primary, purple, green, yellow, red used for status/category blocks. Text near-black, secondary text grey.
- Status chips: small rounded-full pills ("Approved", "Pending", "Paid", "Low stock").
- Weekend/unavailable cells use a diagonal hatch pattern (CSS repeating-linear-gradient).
- Typography: Inter, bold headlines, small grey labels.
- Light theme only. No dark mode.

BUILD THESE REUSABLE COMPONENTS in src/components/ui/, each in its own file with typed props:
Card, SectionHeader (title + "View all" link), PillTabs, IconRailItem, Avatar, AvatarStack, StatusChip, StatCard (label, value, delta), Button (primary/secondary/ghost, pill), Modal, Drawer, DataTable (simple, sortable, responsive), EmptyState, Skeleton, Toast.

BUILD THE SHELL in src/components/layout/:

- AppShell: icon rail + top bar + content area. On screens below 768px the rail becomes a bottom tab bar and the top bar collapses to a title + avatar.
- Navigation items come from a config object keyed by role (owner, admin, receptionist, bartender, kitchen, shopkeeper, member), so adding a screen later means editing one config.
- RoleGuard component and a mock useAuth() hook (a role switcher in dev only, so we can demo every role).

ROUTES: pre-register every route as a placeholder page that says its name: /, /about, /plans, /login, /member/_, /staff/_. Do not build their content.

RULES:

- Mobile-first, test at 360px, 768px, 1280px.
- Tailwind theme tokens go in tailwind.config.ts; no hardcoded hex values in components.
- Do not touch any file outside src/ and the Tailwind/Vite config.
- Add a /dev/design page that renders every component once so we can eyeball them.

When done, list the files you created and anything you were unsure about. Do not add extra features.
