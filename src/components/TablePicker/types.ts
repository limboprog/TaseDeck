import type { ReactNode } from "react";

export type TablePickerOption<T extends string = string> = {
  value: T;
  label: string;
};

export type TablePickerAnchor = {
  left: number;
  top: number;
  width: number;
};

export type TablePickerItemRenderProps<T extends string = string> = {
  option: TablePickerOption<T>;
  selected: boolean;
  isLast: boolean;
  onPick: () => void;
};

export type TablePickerSearchProps<T extends string = string> = {
  value: string;
  options: TablePickerOption<T>[];
  onValueChange: (value: string) => void;
  onSelect: (option: TablePickerOption<T>) => void;
  onCommit?: () => void;
  filterOption?: (option: TablePickerOption<T>, query: string) => boolean;
  placeholder?: string;
  autoFocus?: boolean;
  icon?: ReactNode;
  inputStyle?: React.CSSProperties;
  renderItem?: (props: TablePickerItemRenderProps<T>) => ReactNode;
};

export type TablePickerSelectProps<T extends string = string> = {
  value: T | null;
  options: TablePickerOption<T>[];
  onSelect: (option: TablePickerOption<T>) => void;
  placeholder?: string;
  autoOpen?: boolean;
  disabled?: boolean;
  renderItem?: (props: TablePickerItemRenderProps<T>) => ReactNode;
};
