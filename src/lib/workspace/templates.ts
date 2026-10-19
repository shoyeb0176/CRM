export type BlockType = "heading" | "text" | "todo" | "divider" | "ai";

export type BlockContent = {
  text?: string;
  checked?: boolean;
  level?: 1 | 2;
  question?: string;
};

export type TemplateBlock = { type: BlockType; content: BlockContent };

export type PageTemplate = {
  id: string;
  label: string;
  description: string;
  icon: string;
  title: string;
  blocks: TemplateBlock[];
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "blank",
    label: "Blank page",
    description: "Start from nothing.",
    icon: "📄",
    title: "Untitled",
    blocks: [{ type: "text", content: { text: "" } }],
  },
  {
    id: "meeting",
    label: "Meeting notes",
    description: "Agenda, notes and follow-up actions.",
    icon: "🗒️",
    title: "Meeting notes",
    blocks: [
      { type: "heading", content: { text: "Agenda", level: 1 } },
      { type: "text", content: { text: "" } },
      { type: "heading", content: { text: "Notes", level: 2 } },
      { type: "text", content: { text: "" } },
      { type: "heading", content: { text: "Actions", level: 2 } },
      { type: "todo", content: { text: "Follow up with the customer", checked: false } },
      { type: "todo", content: { text: "Send recap email", checked: false } },
    ],
  },
  {
    id: "project-brief",
    label: "Project brief",
    description: "Goal, scope, milestones and risks.",
    icon: "🚀",
    title: "Project brief",
    blocks: [
      { type: "heading", content: { text: "Goal", level: 1 } },
      { type: "text", content: { text: "What outcome does this project deliver?" } },
      { type: "heading", content: { text: "Scope", level: 2 } },
      { type: "text", content: { text: "" } },
      { type: "heading", content: { text: "Milestones", level: 2 } },
      { type: "todo", content: { text: "Kick-off", checked: false } },
      { type: "todo", content: { text: "Delivery", checked: false } },
      { type: "divider", content: {} },
      { type: "heading", content: { text: "Risks", level: 2 } },
      { type: "text", content: { text: "" } },
    ],
  },
  {
    id: "account-plan",
    label: "Account plan",
    description: "Customer context, open work and next steps, with an AI briefing.",
    icon: "🤝",
    title: "Account plan",
    blocks: [
      { type: "ai", content: { question: "Summarise this account: health, open work, money and the next best action." } },
      { type: "heading", content: { text: "Relationship", level: 1 } },
      { type: "text", content: { text: "Key people, history, how we win here." } },
      { type: "heading", content: { text: "Next steps", level: 2 } },
      { type: "todo", content: { text: "Schedule quarterly review", checked: false } },
    ],
  },
  {
    id: "sop",
    label: "Process / SOP",
    description: "A repeatable procedure with steps and owners.",
    icon: "⚙️",
    title: "Standard operating procedure",
    blocks: [
      { type: "heading", content: { text: "Purpose", level: 1 } },
      { type: "text", content: { text: "" } },
      { type: "heading", content: { text: "Steps", level: 2 } },
      { type: "todo", content: { text: "Step one", checked: false } },
      { type: "todo", content: { text: "Step two", checked: false } },
      { type: "divider", content: {} },
      { type: "heading", content: { text: "Owner", level: 2 } },
      { type: "text", content: { text: "" } },
    ],
  },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  todo: "To-do",
  divider: "Divider",
  ai: "AI block",
};
