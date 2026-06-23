import type { CSSProperties, ReactNode } from "react";
import { colors, surfaces } from "../../theme";

/** Between foreground and legacy muted tool description color. */
export const MCP_TOOL_READABLE_TEXT =
  "color-mix(in srgb, var(--td-foreground) 68%, var(--td-muted))";

const BODY_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: MCP_TOOL_READABLE_TEXT,
  fontSize: 13,
  lineHeight: "20px",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const CODE_BLOCK_STYLE: CSSProperties = {
  margin: 0,
  padding: "8px 10px",
  borderRadius: 6,
  background: surfaces.command,
  color: MCP_TOOL_READABLE_TEXT,
  fontSize: 13,
  lineHeight: "20px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowX: "auto",
};

const INLINE_CODE_STYLE: CSSProperties = {
  padding: "1px 5px",
  borderRadius: 4,
  background: surfaces.command,
  color: MCP_TOOL_READABLE_TEXT,
  fontSize: 12,
  lineHeight: "18px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

type DescriptionBlock =
  | { type: "paragraph"; text: string }
  | { type: "code"; language?: string; text: string };

const FENCED_CODE_RE = /```([^\n`]*)\n?([\s\S]*?)```/g;

function pushParagraphs(raw: string, blocks: DescriptionBlock[]) {
  const chunks = raw.split(/\n{2,}/);
  for (const chunk of chunks) {
    const text = chunk.trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
  }
}

export function parseToolDescription(text: string): DescriptionBlock[] {
  const source = text.trim();
  if (!source) {
    return [];
  }

  const blocks: DescriptionBlock[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(FENCED_CODE_RE)) {
    const index = match.index ?? 0;
    pushParagraphs(source.slice(lastIndex, index), blocks);
    blocks.push({
      type: "code",
      language: match[1]?.trim() || undefined,
      text: match[2]?.trim() ?? "",
    });
    lastIndex = index + match[0].length;
  }

  pushParagraphs(source.slice(lastIndex), blocks);
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: source }];
}

function renderInlineCode(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(`[^`\n]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={`${keyPrefix}-code-${index}`} style={INLINE_CODE_STYLE}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function ParagraphBlock({ text, isLast }: { text: string; isLast?: boolean }) {
  const lines = text.split("\n");
  return (
    <p style={{ ...BODY_TEXT_STYLE, marginBottom: isLast ? 0 : 10 }}>
      {lines.map((line, lineIndex) => (
        <span key={`line-${lineIndex}`}>
          {lineIndex > 0 ? <br /> : null}
          {renderInlineCode(line, `p-${lineIndex}`)}
        </span>
      ))}
    </p>
  );
}

function CodeBlock({
  language,
  text,
  isLast,
}: {
  language?: string;
  text: string;
  isLast?: boolean;
}) {
  const label = language ? language.toUpperCase() : null;
  return (
    <div style={{ marginBottom: isLast ? 0 : 10 }}>
      {label ? (
        <div
          style={{
            marginBottom: 4,
            color: colors.muted,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.04,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      ) : null}
      <pre style={CODE_BLOCK_STYLE}>{text}</pre>
    </div>
  );
}

export function ToolDescriptionMarkup({ text }: { text: string }) {
  const blocks = parseToolDescription(text);

  if (blocks.length === 0) {
    return <p style={BODY_TEXT_STYLE}>No description provided.</p>;
  }

  return (
    <div>
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        if (block.type === "code") {
          return (
            <CodeBlock
              key={`code-${index}`}
              language={block.language}
              text={block.text}
              isLast={isLast}
            />
          );
        }
        return (
          <ParagraphBlock
            key={`p-${index}`}
            text={block.text}
            isLast={isLast}
          />
        );
      })}
    </div>
  );
}
