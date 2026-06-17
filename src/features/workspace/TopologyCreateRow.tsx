import { useEffect, useRef, type KeyboardEvent } from "react";
import { IoPrism } from "../../icons";
import { Text, XStack } from "tamagui";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { TopologyTableIconButton } from "./TopologyTableIconButton";
import { topologyRowChrome } from "./topologyRowStyles";

type TopologyCreateRowProps = {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

export function TopologyCreateRow({
  name,
  onNameChange,
  onCancel,
  onCommit,
}: TopologyCreateRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <XStack
      width="100%"
      height={44}
      px={14}
      items="center"
      justify="space-between"
      gap={12}
      style={{
        ...topologyRowChrome(true),
        borderColor: borders.selected,
      }}
    >
      <XStack flex={1} items="center" gap={8} minW={0}>
        <IoPrism size={16} color={colors.accent} aria-hidden />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: `1px solid ${tamaguiSurfaces.controlBorder}`,
            background: tamaguiSurfaces.controlBg,
          }}
        >
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Topology name"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              color: colors.foreground,
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
            }}
          />
        </div>
      </XStack>

      <XStack items="center" gap={6} shrink={0} height={28}>
        <TopologyTableIconButton
          width={62}
          aria-label="Cancel"
          onPress={(event) => {
            event.stopPropagation();
            onCancel();
          }}
        >
          <Text color={colors.muted} fontSize={12} fontWeight="500">
            Cancel
          </Text>
        </TopologyTableIconButton>
      </XStack>
    </XStack>
  );
}
