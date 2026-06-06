import { Button, Text, XStack } from "tamagui";
import { borders, colors, tamaguiSurfaces } from "../theme";

type ListPaginationFooterProps = {
  pageStart: number;
  pageEnd: number;
  total: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** When true, appends "+" to the total (more items exist beyond the loaded count). */
  hasMore?: boolean;
};

export function ListPaginationFooter({
  pageStart,
  pageEnd,
  total,
  page,
  pageCount,
  onPageChange,
  hasMore = false,
}: ListPaginationFooterProps) {
  if (total <= 0 && pageEnd <= 0) {
    return null;
  }

  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const displayTotal = Math.max(total, pageEnd);

  return (
    <XStack
      px={4}
      py={10}
      items="center"
      justify="space-between"
      shrink={0}
      width="100%"
    >
      <Text color={colors.muted} fontSize={12} select="none">
        {pageStart}-{pageEnd} of {displayTotal}
        {hasMore ? "+" : ""}
      </Text>
      <XStack gap={8} items="center">
        <Button
          unstyled
          px={10}
          py={5}
          rounded={6}
          disabled={safePage <= 0}
          opacity={safePage <= 0 ? 0.45 : 1}
          bg={tamaguiSurfaces.controlBg}
          borderWidth={1}
          borderColor={borders.default as never}
          hoverStyle={{ bg: tamaguiSurfaces.controlHoverBg }}
          onPress={() => onPageChange(Math.max(0, safePage - 1))}
        >
          <Text color={colors.foreground} fontSize={12} fontWeight={500} select="none">
            Prev
          </Text>
        </Button>
        <Text color={colors.muted} fontSize={12} minW={36} text="center" select="none">
          {safePage + 1}/{pageCount}
        </Text>
        <Button
          unstyled
          px={10}
          py={5}
          rounded={6}
          disabled={safePage >= pageCount - 1}
          opacity={safePage >= pageCount - 1 ? 0.45 : 1}
          bg={tamaguiSurfaces.controlBg}
          borderWidth={1}
          borderColor={borders.default as never}
          hoverStyle={{ bg: tamaguiSurfaces.controlHoverBg }}
          onPress={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
        >
          <Text color={colors.foreground} fontSize={12} fontWeight={500} select="none">
            Next
          </Text>
        </Button>
      </XStack>
    </XStack>
  );
}
