import type { ReactNode } from "react";
import { GoSignIn, IoCheckmark, MdErrorOutline } from "../../icons";
import { Button, Text, XStack } from "tamagui";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import type { McpListCardConnectionStatus } from "./mcpConnectionListStatus";

const STATUS_ICON_SIZE = 18;

type StatusActionButtonProps = {
  icon?: ReactNode;
  label: string;
  onPress?: () => void;
  ariaLabel: string;
};

function StatusActionButton({ icon, label, onPress, ariaLabel }: StatusActionButtonProps) {
  return (
    <Button
      unstyled
      px={5}
      py={2}
      rounded={4}
      borderWidth={1}
      borderColor={borders.default}
      bg="transparent"
      hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
      onPress={(event) => {
        event.stopPropagation();
        onPress?.();
      }}
      aria-label={ariaLabel}
    >
      <XStack gap={icon ? 4 : 0} items="center">
        {icon ? (
          <XStack width={14} items="center" justify="center" shrink={0} style={{ color: colors.muted }}>
            {icon}
          </XStack>
        ) : null}
        <Text color={colors.foreground} fontSize={11} fontWeight="400" select="none">
          {label}
        </Text>
      </XStack>
    </Button>
  );
}

type McpListCardConnectionLabelProps = {
  status?: McpListCardConnectionStatus;
  onSignIn?: () => void;
  onReadMore?: () => void;
  alwaysShowReadMore?: boolean;
  readMoreTextOnly?: boolean;
};

export function McpListCardConnectionLabel({
  status,
  onSignIn,
  onReadMore,
  alwaysShowReadMore = false,
  readMoreTextOnly = false,
}: McpListCardConnectionLabelProps) {
  const showReadMore = Boolean(onReadMore && (alwaysShowReadMore || status === "failed"));

  const statusNode =
    status === "connected" ? (
      <XStack gap={6} items="center" shrink={0} pointerEvents="none">
        <XStack
          width={STATUS_ICON_SIZE}
          height={STATUS_ICON_SIZE}
          rounded={999}
          bg={colors.accent}
          items="center"
          justify="center"
          shrink={0}
        >
          <IoCheckmark size={12} color="#fff" />
        </XStack>
        <Text color={colors.foreground} fontSize={12} fontWeight="400" select="none">
          Connected
        </Text>
      </XStack>
    ) : status === "auth" ? (
      <StatusActionButton
        icon={<GoSignIn size={12} />}
        label="Sign in"
        onPress={onSignIn}
        ariaLabel="Sign in"
      />
    ) : null;

  const readMoreNode = showReadMore ? (
    <StatusActionButton
      icon={readMoreTextOnly || alwaysShowReadMore ? undefined : <MdErrorOutline size={12} />}
      label="Read more"
      onPress={onReadMore}
      ariaLabel="Read more"
    />
  ) : null;

  if (!statusNode && !readMoreNode) {
    return null;
  }

  return (
    <XStack gap={8} items="center" shrink={0} pointerEvents="box-none">
      {statusNode}
      {readMoreNode}
    </XStack>
  );
}
