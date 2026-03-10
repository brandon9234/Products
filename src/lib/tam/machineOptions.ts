import type { TamPrimitive } from "./types";

export const MACHINE_COLUMN_NAME = "Machine used For Production";

export const MACHINE_OPTIONS = [
  {
    label: "UV Printing",
    value: "uv-printing",
    aliases: ["uv printing", "uv printer", "uv flatbed printer", "uv flatbed"]
  },
  {
    label: "CO2 Engraving",
    value: "co2-engraving",
    aliases: ["co2 engraving", "co2 engrave", "co2 laser", "engraving"]
  },
  {
    label: "CO2 Cutting",
    value: "co2-cutting",
    aliases: ["co2 cutting", "co2 cut", "laser cutting"]
  },
  {
    label: "Fiber Cuting",
    value: "fiber-cuting",
    aliases: ["fiber cuting", "fiber cutting", "fiber laser"]
  },
  {
    label: "Sublimation",
    value: "sublimation",
    aliases: ["sublimation", "sublimate"]
  },
  {
    label: "Routering",
    value: "routering",
    aliases: ["routering", "router", "cnc router"]
  },
  {
    label: "Embroidering",
    value: "embroidering",
    aliases: ["embroidering", "embroidery", "embroider"]
  },
  {
    label: "DTG (Direct to Garmet)",
    value: "dtg-direct-to-garmet",
    aliases: ["dtg", "direct to garmet", "direct to garment"]
  },
  {
    label: "InkJet",
    value: "inkjet",
    aliases: ["inkjet", "ink jet"]
  },
  {
    label: "Toner Printer",
    value: "toner-printer",
    aliases: ["toner printer", "toner"]
  }
] as const;

export type MachineOptionValue = (typeof MACHINE_OPTIONS)[number]["value"];

export function parseMachineSelection(value: TamPrimitive): Set<MachineOptionValue> {
  if (typeof value !== "string") {
    return new Set();
  }

  const normalized = value.toLowerCase();
  const selected = new Set<MachineOptionValue>();

  for (const option of MACHINE_OPTIONS) {
    if (option.aliases.some((alias) => normalized.includes(alias))) {
      selected.add(option.value);
    }
  }

  return selected;
}

export function serializeMachineSelection(
  selectedMachines: Set<MachineOptionValue>
): string | null {
  const orderedLabels = MACHINE_OPTIONS.filter((option) =>
    selectedMachines.has(option.value)
  ).map((option) => option.label);

  return orderedLabels.length > 0 ? orderedLabels.join(", ") : null;
}
