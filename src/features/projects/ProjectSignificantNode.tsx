import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { PANE_ROW_RADIUS } from "../../components/pane/paneStyles";
import { borders, colors, project } from "../../theme";

type ProjectSignificantNodeProps = {
  label: string;
  title: string;
  icon?: ReactNode;
  labelSuffix?: ReactNode;
  action?: ReactNode;
  width?: number;
};

export function ProjectSignificantNode({
  label,
  title,
  icon,
  labelSuffix,
  action,
  width,
}: ProjectSignificantNodeProps) {
  return (
    <XStack
      items="center"
      gap={9}
      px={10}
      py={7}
      minH={44}
      rounded={PANE_ROW_RADIUS}
      borderWidth={1}
      borderColor={borders.faint}
      shrink={0}
      minW={0}
      width={width}
      maxW={width}
      style={{ background: project.nodeSignificant }}
    >
      <XStack
        width={28}
        height={32}
        items="center"
        justify="center"
        shrink={0}
        self="center"
      >
        {icon}
      </XStack>

      <YStack flex={1} minW={0} gap={2} justify="center">
        <XStack items="center" gap={6} minW={0}>
          <Text
            color={colors.muted}
            fontSize={13}
            fontWeight="600"
            lineHeight={16}
            numberOfLines={1}
            ellipsizeMode="tail"
            select="none"
            shrink={0}
          >
            {label}
          </Text>
          {labelSuffix ? <XStack shrink={0} items="center">{labelSuffix}</XStack> : null}
        </XStack>
        <Text
          color={colors.foreground}
          fontSize={13}
          fontWeight="600"
          lineHeight={16}
          numberOfLines={1}
          ellipsizeMode="tail"
          select="none"
        >
          {title}
        </Text>
      </YStack>

      {action ? <XStack shrink={0} items="center">{action}</XStack> : null}
    </XStack>
  );
}
