import { useMemo, useState, type ReactNode } from "react";
import { IoArrowBack, IoLogoGithub, PiGlobeThin } from "../../icons";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import {
  getRequiredInputs,
  parseServerSetup,
  type ConfigInput,
  type ParsedLocalSetup,
  type ParsedRemoteSetup,
} from "../../services/mcp_registry/parser";
import type { McpServerEntry } from "../../services/mcp_registry";
import { borders, colors, surfaces, tamaguiSurfaces } from "../../theme";
import { createDefaultInputValues } from "../../services/mcp_installed";
import { openExternal } from "../../utils/openExternal";
import { CommandBlock } from "./CommandBlock";
import { McpAddButton } from "./McpAddButton";

type McpServerDetailPageProps = {
  entry: McpServerEntry;
  onBack: () => void;
};

function formatLinkLabel(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    if (path && path !== "/") {
      return `${host}${path}`;
    }
    return host || fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value?: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function Chip({ label }: { label: string }) {
  return (
    <XStack
      px={8}
      py={4}
      rounded={999}
      bg={surfaces.card}
      borderWidth={1}
      borderColor={tamaguiSurfaces.controlHoverBg}
    >
      <Text color={colors.muted} fontSize={11} fontWeight="500">
        {label}
      </Text>
    </XStack>
  );
}

function LinkChip({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <XStack
      px={8}
      py={4}
      rounded={999}
      bg={surfaces.card}
      borderWidth={1}
      borderColor={tamaguiSurfaces.controlHoverBg}
      gap={5}
      items="center"
      maxW={200}
      shrink={0}
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ borderColor: borders.strong }}
      onPress={() => void openExternal(href)}
    >
      <YStack shrink={0}>{icon}</YStack>
      <Text
        color={colors.muted}
        fontSize={11}
        fontWeight="500"
        numberOfLines={1}
        ellipsizeMode="tail"
        flex={1}
        minW={0}
        overflow="hidden"
      >
        {label}
      </Text>
    </XStack>
  );
}

function SubsectionTitle({ children }: { children: string }) {
  return (
    <Text color={colors.muted} fontSize={13} fontWeight="600">
      {children}
    </Text>
  );
}

function ConnectionSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <McpPanel p={16} gap={14}>
      <Text color={colors.foreground} fontSize={16} fontWeight="700">
        {label}
      </Text>
      {children}
    </McpPanel>
  );
}

function ConfigInputField({
  input,
  value,
  onChange,
}: {
  input: ConfigInput;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <YStack gap={6}>
      <Text color={colors.foreground} fontSize={13} fontWeight="500">
        {input.name}
        {input.isRequired ? <Text color={colors.error}> *</Text> : null}
      </Text>
      {input.description ? (
        <Text color={colors.muted} fontSize={12}>
          {input.description}
        </Text>
      ) : null}
      <Input
        value={value}
        onChangeText={onChange}
        secureTextEntry={input.isSecret}
        placeholder={input.placeholder ?? `Enter ${input.name}`}
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
  );
}

function useInputValues(inputs: ConfigInput[]) {
  return useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const input of inputs) {
      if (input.defaultValue) {
        initial[input.id] = input.defaultValue;
      }
    }
    return initial;
  });
}

function LocalSetupBlock({
  setup,
  showLabel,
  values,
  onValueChange,
}: {
  setup: ParsedLocalSetup;
  showLabel: boolean;
  values?: Record<string, string>;
  onValueChange?: (inputId: string, value: string) => void;
}) {
  const [internalValues, setInternalValues] = useInputValues(setup.inputs);
  const activeValues = values ?? internalValues;
  const requiredInputs = getRequiredInputs(setup);
  const run = useMemo(() => setup.buildRun(activeValues), [setup, activeValues]);

  const handleChange = (inputId: string, value: string) => {
    if (onValueChange) {
      onValueChange(inputId, value);
      return;
    }

    setInternalValues((current) => ({ ...current, [inputId]: value }));
  };

  return (
    <YStack gap={12}>
      {showLabel ? (
        <XStack gap={8} flexWrap="wrap">
          <Chip label={setup.registryType} />
          <Chip label={setup.transportType} />
        </XStack>
      ) : null}

      {requiredInputs.length > 0 ? (
        <YStack gap={10}>
          {requiredInputs.map((input) => (
            <ConfigInputField
              key={input.id}
              input={input}
              value={activeValues[input.id] ?? ""}
              onChange={(value) => handleChange(input.id, value)}
            />
          ))}
        </YStack>
      ) : null}

      <YStack gap={8}>
        <SubsectionTitle>Install</SubsectionTitle>
        <CommandBlock command={setup.installCommand} />
      </YStack>

      <YStack gap={8}>
        <SubsectionTitle>Run</SubsectionTitle>
        <CommandBlock command={run.shell} />
      </YStack>

      <YStack gap={8}>
        <SubsectionTitle>mcp.json</SubsectionTitle>
        <CommandBlock command={run.mcpJson} />
      </YStack>
    </YStack>
  );
}

function RemoteConnectionsBlock({ setups }: { setups: ParsedRemoteSetup[] }) {
  return (
    <YStack gap={20}>
      {setups.map((setup, index) => (
        <RemoteConnectionItem
          key={setup.id}
          setup={setup}
          showDivider={index > 0}
          showTransportLabel={setups.length > 1}
        />
      ))}
    </YStack>
  );
}

function RemoteConnectionItem({
  setup,
  showDivider,
  showTransportLabel,
}: {
  setup: ParsedRemoteSetup;
  showDivider: boolean;
  showTransportLabel: boolean;
}) {
  const [values, setValues] = useInputValues(setup.inputs);
  const requiredInputs = getRequiredInputs(setup);
  const connection = useMemo(
    () => setup.buildConnection(values),
    [setup, values],
  );

  return (
    <YStack gap={12}>
      {showDivider ? (
        <YStack height={1} bg={tamaguiSurfaces.activeBg} my={4} />
      ) : null}

      {showTransportLabel ? (
        <XStack gap={8} flexWrap="wrap">
          <Chip label={setup.transportType} />
        </XStack>
      ) : null}

      {requiredInputs.length > 0 ? (
        <YStack gap={10}>
          {requiredInputs.map((input) => (
            <ConfigInputField
              key={input.id}
              input={input}
              value={values[input.id] ?? ""}
              onChange={(value) =>
                setValues((current) => ({ ...current, [input.id]: value }))
              }
            />
          ))}
        </YStack>
      ) : null}

      <CommandBlock command={connection} />
    </YStack>
  );
}

export function McpServerDetailPage({ entry, onBack }: McpServerDetailPageProps) {
  const setup = useMemo(() => parseServerSetup(entry), [entry]);
  const primaryLocalSetup = setup.localSetups[0] ?? null;
  const [inputValues, setInputValues] = useState<Record<string, string>>(() =>
    primaryLocalSetup
      ? createDefaultInputValues(primaryLocalSetup.inputs)
      : {},
  );
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const { server, meta } = entry;
  const title = server.title ?? server.name;
  const updated = formatDate(meta.updatedAt ?? meta.publishedAt);
  const published = formatDate(meta.publishedAt);
  const websiteUrl = server.websiteUrl?.trim();
  const repositoryUrl = server.repository?.url?.trim();

  const handleInputChange = (inputId: string, value: string) => {
    setInputValues((current) => ({ ...current, [inputId]: value }));
  };

  return (
    <YStack flex={1} minH={0} minW={0} width="100%" overflow="hidden">
      <XStack items="center" gap={12} mb={16} shrink={0}>
        <Button
          unstyled
          width={36}
          height={36}
          rounded={8}
          bg={tamaguiSurfaces.controlHoverBg}
          hoverStyle={{ bg: borders.strong }}
          onPress={onBack}
          aria-label="Back to Market"
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.foreground }}>
            <IoArrowBack size={18} />
          </XStack>
        </Button>
        <YStack flex={1} minW={0} gap={2}>
          <Text
            color={colors.foreground}
            fontSize={22}
            fontWeight="700"
            letterSpacing={-0.02}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            color={colors.muted}
            fontSize={13}
            numberOfLines={1}
            style={{ fontFamily: "monospace" }}
          >
            {server.name}
          </Text>
        </YStack>
        <McpAddButton
          entry={entry}
          onAdded={() => setAddMessage("Added to MCP section.")}
        />
      </XStack>

      {addMessage ? (
        <Text color={colors.muted} fontSize={13} mb={12} shrink={0}>
          {addMessage}
        </Text>
      ) : null}

      <div
        className="td-scroll-y"
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        <YStack gap={20} pb={24} width="100%">
          <XStack gap={8} flexWrap="wrap" width="100%">
            <Chip label={`v${server.version}`} />
            {meta.status ? <Chip label={meta.status} /> : null}
            {published ? <Chip label={`Published ${published}`} /> : null}
            {updated ? <Chip label={`Updated ${updated}`} /> : null}
            {websiteUrl ? (
              <LinkChip
                href={websiteUrl}
                icon={<PiGlobeThin size={12} color={colors.muted} />}
                label={formatLinkLabel(websiteUrl, "Website")}
              />
            ) : null}
            {repositoryUrl ? (
              <LinkChip
                href={repositoryUrl}
                icon={<IoLogoGithub size={12} color={colors.muted} />}
                label={formatLinkLabel(repositoryUrl, "GitHub")}
              />
            ) : null}
          </XStack>

          {server.description ? (
            <Text color={colors.muted} fontSize={14} lineHeight={22} width="100%">
              {server.description}
            </Text>
          ) : null}

          {setup.hasLocal ? (
            <ConnectionSection label="Local">
              <YStack gap={20}>
                {setup.localSetups.map((localSetup, index) => (
                  <LocalSetupBlock
                    key={localSetup.id}
                    setup={localSetup}
                    showLabel={setup.localSetups.length > 1}
                    values={index === 0 ? inputValues : undefined}
                    onValueChange={index === 0 ? handleInputChange : undefined}
                  />
                ))}
              </YStack>
            </ConnectionSection>
          ) : null}

          {setup.hasRemote ? (
            <ConnectionSection label="Remote">
              <RemoteConnectionsBlock setups={setup.remoteSetups} />
            </ConnectionSection>
          ) : null}

          <ConnectionSection label="Configuration JSON">
            <CommandBlock command={setup.rawJson} label="json" />
          </ConnectionSection>
        </YStack>
      </div>
    </YStack>
  );
}
