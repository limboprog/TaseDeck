import { useState } from "react";
import { IoAdd } from "../../icons";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import {
  createEntryId,
  nameFromPath,
  type PathEntry,
} from "../../services/workspace";
import { borders, colors, surfaces, tamaguiSurfaces } from "../../theme";

type PathEntryListProps = {
  title: string;
  emptyLabel: string;
  pathPlaceholder: string;
  entries: PathEntry[];
  onChange: (entries: PathEntry[]) => void;
};

export function PathEntryList({
  title,
  emptyLabel,
  pathPlaceholder,
  entries,
  onChange,
}: PathEntryListProps) {
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");

  const resetAddForm = () => {
    setAdding(false);
    setPath("");
    setName("");
  };

  const handleAdd = () => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      return;
    }

    const nextEntry: PathEntry = {
      id: createEntryId(),
      path: trimmedPath,
      name: name.trim() || nameFromPath(trimmedPath),
    };

    onChange([...entries, nextEntry]);
    resetAddForm();
  };

  const handleRemove = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };

  return (
    <GlassPanel p={14} gap={12}>
      <XStack justify="space-between" items="center" gap={12}>
        <Text color={colors.foreground} fontSize={15} fontWeight="600">
          {title}
        </Text>
        <Button
          unstyled
          width={32}
          height={32}
          rounded={8}
          bg={tamaguiSurfaces.controlHoverBg}
          hoverStyle={{ bg: borders.strong }}
          onPress={() => setAdding((current) => !current)}
          aria-label={`Add ${title}`}
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.foreground }}>
            <IoAdd size={18} />
          </XStack>
        </Button>
      </XStack>

      {entries.length === 0 && !adding ? (
        <Text color={colors.muted} fontSize={13}>
          {emptyLabel}
        </Text>
      ) : null}

      {entries.length > 0 ? (
        <YStack gap={8}>
          {entries.map((entry) => (
            <XStack
              key={entry.id}
              gap={10}
              items="center"
              px={10}
              py={8}
              rounded={8}
              bg={surfaces.subtle}
              borderWidth={1}
              borderColor={tamaguiSurfaces.controlHoverBg}
            >
              <YStack flex={1} minW={0} gap={2}>
                <Text color={colors.foreground} fontSize={13} fontWeight="500">
                  {entry.name}
                </Text>
                <Text
                  color={colors.muted}
                  fontSize={12}
                  numberOfLines={1}
                  style={{ fontFamily: "monospace" }}
                >
                  {entry.path}
                </Text>
              </YStack>
              <Button
                unstyled
                px={8}
                py={4}
                rounded={6}
                onPress={() => handleRemove(entry.id)}
              >
                <Text color={colors.muted} fontSize={12}>
                  Remove
                </Text>
              </Button>
            </XStack>
          ))}
        </YStack>
      ) : null}

      {adding ? (
        <YStack gap={10} pt={4}>
          <YStack gap={6}>
            <Text color={colors.muted} fontSize={12}>
              Path
            </Text>
            <Input
              value={path}
              onChangeText={setPath}
              placeholder={pathPlaceholder}
              color={colors.foreground}
              placeholderTextColor={colors.muted as never}
              bg={tamaguiSurfaces.controlBg}
              borderWidth={1}
              borderColor={tamaguiSurfaces.activeBg}
              rounded={8}
              px={12}
              py={10}
              fontSize={13}
            />
          </YStack>

          <YStack gap={6}>
            <Text color={colors.muted} fontSize={12}>
              Name (optional)
            </Text>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Display name"
              color={colors.foreground}
              placeholderTextColor={colors.muted as never}
              bg={tamaguiSurfaces.controlBg}
              borderWidth={1}
              borderColor={tamaguiSurfaces.activeBg}
              rounded={8}
              px={12}
              py={10}
              fontSize={13}
            />
          </YStack>

          <XStack gap={8} justify="flex-end">
            <Button
              unstyled
              px={12}
              py={8}
              rounded={8}
              onPress={resetAddForm}
            >
              <Text color={colors.muted} fontSize={13}>
                Cancel
              </Text>
            </Button>
            <Button
              unstyled
              px={12}
              py={8}
              rounded={8}
              bg={tamaguiSurfaces.activeBg}
              hoverStyle={{ bg: borders.focus }}
              onPress={handleAdd}
            >
              <Text color={colors.foreground} fontSize={13}>
                Add
              </Text>
            </Button>
          </XStack>
        </YStack>
      ) : null}
    </GlassPanel>
  );
}
