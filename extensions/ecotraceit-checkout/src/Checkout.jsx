import {
  reactExtension, Banner, BlockStack, Checkbox, Text, useApplyAttributeChange,
  useApplyCartLinesChange, useCartLines, useSettings, useShippingAddress,
} from "@shopify/ui-extensions-react/checkout";
import {useMemo, useState} from "react";

export default reactExtension("purchase.checkout.block.render", () => <EcoTraceITCheckout />);

function EcoTraceITCheckout() {
  const lines = useCartLines();
  const address = useShippingAddress();
  const settings = useSettings();
  const applyAttributeChange = useApplyAttributeChange();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [selected, setSelected] = useState(false);
  const [busy, setBusy] = useState(false);

  const estimate = useMemo(() => {
    const grams = lines.reduce((sum, line) => {
      const weight = Number(line.merchandise?.product?.metafield?.value || 500);
      return sum + weight * line.quantity;
    }, 0);
    const countryMultiplier = address?.countryCode === "IT" ? 1 : 1.8;
    return Math.max(0.09, (0.08 + grams / 1000 * 0.07) * countryMultiplier);
  }, [lines, address?.countryCode]);

  async function changeOffset(checked) {
    setBusy(true);
    const value = checked ? "true" : "false";
    const attributeResult = await applyAttributeChange({type: "updateAttribute", key: "_ecotraceit_carbon_neutral", value});
    if (attributeResult.type === "error") {
      setBusy(false);
      return;
    }
    const variantId = String(settings.offsetVariantId || "");
    if (variantId) {
      const existing = lines.find((line) => line.merchandise.id === variantId);
      if (checked && !existing) await applyCartLinesChange({type: "addCartLine", merchandiseId: variantId, quantity: 1});
      if (!checked && existing) await applyCartLinesChange({type: "removeCartLine", id: existing.id, quantity: existing.quantity});
    }
    setSelected(checked);
    setBusy(false);
  }

  return (
    <BlockStack spacing="base">
      <Banner status="success" title={"Impatto stimato: " + estimate.toFixed(2) + " kg CO₂e"}>
        Packaging riciclabile consigliato da EcoTraceIT.
      </Banner>
      <Checkbox checked={selected} disabled={busy} onChange={changeOffset}>
        Rendi la spedizione Carbon Neutral
      </Checkbox>
      {!settings.offsetVariantId && <Text size="small" appearance="subdued">L&apos;offset sarà registrato senza addebito finché il merchant non configura la variante.</Text>}
    </BlockStack>
  );
}
