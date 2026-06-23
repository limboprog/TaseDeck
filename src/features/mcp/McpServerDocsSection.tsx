import { useMemo, useState, type Ref } from "react";
import { IoLogoGithub, PiGlobeThin } from "../../icons";
import { Input, Text, XStack, YStack } from "tamagui";
import {
  getRequiredInputs,
  parseServerSetup,
  type ConfigInput,
  type ParsedLocalSetup,
  type ParsedRemoteSetup,
} from "../../services/mcp_registry/parser";
import type { McpServerEntry } from "../../services/mcp_registry";
import { colors, tamaguiSurfaces } from "../../theme";
import { createDefaultInputValues } from "../../services/mcp_installed";
import { CommandBlock } from "./CommandBlock";
import { formatMcpLinkLabel, McpLinkBlock } from "./mcpLinkBlock";
import { getRegistryServerDescription } from "./mcpServerSummary";
import { ToolbarCollapsible } from "../../components/pane";

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
      <Text color={colors.foreground} fontSize={13} fontWeight="500" select="none">
        {input.name}
        {input.isRequired ? <Text color={colors.error}> *</Text> : null}
      </Text>
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

function SubsectionTitle({ children }: { children: string }) {
  return (
    <Text color={colors.muted} fontSize={13} fontWeight="600" select="none">
      {children}
    </Text>
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

function LocalSetupDocs({
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
    <YStack gap={16}>
      {showLabel ? (
        <Text color={colors.muted} fontSize={12} fontWeight="500" select="none">
          {setup.registryType} · {setup.transportType}
        </Text>
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
        <CommandBlock command={run.mcpJson} label="json" />
      </YStack>
    </YStack>
  );
}

function RemoteConnectionDocs({
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
  const connection = useMemo(() => setup.buildConnection(values), [setup, values]);

  return (
    <YStack gap={16}>
      {showDivider ? <YStack height={1} bg={tamaguiSurfaces.activeBg} /> : null}
      {showTransportLabel ? (
        <Text color={colors.muted} fontSize={12} fontWeight="500" select="none">
          {setup.transportType}
        </Text>
      ) : null}
      {requiredInputs.length > 0 ? (
        <YStack gap={10}>
          {requiredInputs.map((input) => (
            <ConfigInputField
              key={input.id}
              input={input}
              value={values[input.id] ?? ""}
              onChange={(value) => setValues((current) => ({ ...current, [input.id]: value }))}
            />
          ))}
        </YStack>
      ) : null}
      <CommandBlock command={connection} />
    </YStack>
  );
}

type McpServerDocsContentProps = {
  entry: McpServerEntry;
  showDescription?: boolean;
};

export function McpServerDocsContent({ entry, showDescription = true }: McpServerDocsContentProps) {
  const setup = useMemo(() => parseServerSetup(entry), [entry]);
  const primaryLocalSetup = setup.localSetups[0] ?? null;
  const [inputValues, setInputValues] = useState<Record<string, string>>(() =>
    primaryLocalSetup ? createDefaultInputValues(primaryLocalSetup.inputs) : {},
  );
  const { server } = entry;
  const websiteUrl = server.websiteUrl?.trim();
  const repositoryUrl = server.repository?.url?.trim();
  const hasLinks = Boolean(websiteUrl || repositoryUrl);
  const description = getRegistryServerDescription(entry);

  const handleInputChange = (inputId: string, value: string) => {
    setInputValues((current) => ({ ...current, [inputId]: value }));
  };

  return (
    <YStack gap={20} width="100%">
      {showDescription ? (
        <Text color={colors.muted} fontSize={14} lineHeight={22} width="100%" select="none">
          {description}
        </Text>
      ) : null}

      {hasLinks ? (
        <XStack gap={8} flexWrap="wrap" width="100%">
          {websiteUrl ? (
            <McpLinkBlock
              href={websiteUrl}
              icon={<PiGlobeThin size={13} color={colors.muted} />}
              label={formatMcpLinkLabel(websiteUrl, "Website")}
            />
          ) : null}
          {repositoryUrl ? (
            <McpLinkBlock
              href={repositoryUrl}
              icon={<IoLogoGithub size={13} color={colors.muted} />}
              label={formatMcpLinkLabel(repositoryUrl, "GitHub")}
            />
          ) : null}
        </XStack>
      ) : null}

      {setup.hasLocal ? (
        <YStack gap={16}>
          <SubsectionTitle>Local</SubsectionTitle>
          {setup.localSetups.map((localSetup, index) => (
            <LocalSetupDocs
              key={localSetup.id}
              setup={localSetup}
              showLabel={setup.localSetups.length > 1}
              values={index === 0 ? inputValues : undefined}
              onValueChange={index === 0 ? handleInputChange : undefined}
            />
          ))}
        </YStack>
      ) : null}

      {setup.hasRemote ? (
        <YStack gap={16}>
          <SubsectionTitle>Remote</SubsectionTitle>
          {setup.remoteSetups.map((remoteSetup, index) => (
            <RemoteConnectionDocs
              key={remoteSetup.id}
              setup={remoteSetup}
              showDivider={index > 0}
              showTransportLabel={setup.remoteSetups.length > 1}
            />
          ))}
        </YStack>
      ) : null}

      <YStack gap={8}>
        <SubsectionTitle>Configuration</SubsectionTitle>
        <CommandBlock command={setup.rawJson} label="json" />
      </YStack>
    </YStack>
  );
}

type InstalledMcpDocsSectionProps = {
  entry: McpServerEntry;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  sectionRef?: Ref<HTMLDivElement>;
};

export function InstalledMcpDocsSection({
  entry,
  expanded,
  onExpandedChange,
  sectionRef,
}: InstalledMcpDocsSectionProps) {
  return (
    <ToolbarCollapsible
      title="Docs"
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      sectionRef={sectionRef}
      stickyHeader={false}
      disableTransition
      bodyGap={16}
      bodyPaddingTop={4}
    >
      <McpServerDocsContent entry={entry} />
    </ToolbarCollapsible>
  );
}
