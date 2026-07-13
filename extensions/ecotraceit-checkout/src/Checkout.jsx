import {
  reactExtension, Banner, BlockStack, Checkbox, Text, useApplyAttributeChange,
  useApplyCartLinesChange, useAppMetafields, useAttributeValues, useCartLines, useSettings, useShippingAddress, useTranslate,
} from "@shopify/ui-extensions-react/checkout";
import {useMemo, useState} from "react";

export default reactExtension("purchase.checkout.block.render", () => <EcoTraceITCheckout />);

function EcoTraceITCheckout() {
  const lines = useCartLines();
  const address = useShippingAddress();
  const settings = useSettings();
  const translate = useTranslate();
  const applyAttributeChange = useApplyAttributeChange();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [neutralAttribute] = useAttributeValues(["_ecotraceit_carbon_neutral"]);
  const [configEntry] = useAppMetafields({namespace: "$app:ecotraceit", key: "checkout_config", type: "shop"});
  const weightEntries = useAppMetafields({namespace: "$app:ecotraceit", key: "weight_grams", type: "product"});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = neutralAttribute === "true";

  const merchantConfig = useMemo(() => {
    try {
      return JSON.parse(configEntry?.metafield?.value || "{}");
    } catch {
      return {};
    }
  }, [configEntry?.metafield?.value]);

  const estimate = useMemo(() => {
    const weightsByProduct = new Map(weightEntries.map((entry) => [entry.target.id, Number(entry.metafield.value)]));
    const grams = lines.reduce((sum, line) => {
      const weight = weightsByProduct.get(line.merchandise?.product?.id) || 500;
      return sum + weight * line.quantity;
    }, 0);
    const countryMultiplier = address?.countryCode === "IT" ? 1 : 1.8;
    return Math.max(0.09, (0.08 + grams / 1000 * 0.07) * countryMultiplier);
  }, [lines, address?.countryCode, weightEntries]);

  async function changeOffset(checked) {
    setBusy(true);
    setError("");
    const value = checked ? "true" : "false";
    try {
      const attributeResult = await applyAttributeChange({type: "updateAttribute", key: "_ecotraceit_carbon_neutral", value});
      if (attributeResult.type === "error") throw new Error(attributeResult.message);
      const variantId = String(settings.offsetVariantId || "");
      if (variantId) {
        const existing = lines.find((line) => line.merchandise.id === variantId);
        const cartResult = checked && !existing
          ? await applyCartLinesChange({type: "addCartLine", merchandiseId: variantId, quantity: 1})
          : !checked && existing
            ? await applyCartLinesChange({type: "removeCartLine", id: existing.id, quantity: existing.quantity})
            : undefined;
        if (cartResult?.type === "error") {
          await applyAttributeChange({
            type: "updateAttribute",
            key: "_ecotraceit_carbon_neutral",
            value: checked ? "false" : "true",
          });
          throw new Error(cartResult.message);
        }
      }
    } catch {
      setError(translate("update_error"));
    } finally {
      setBusy(false);
    }
  }

  if (merchantConfig.checkoutBadgeEnabled === false) return null;

  return (
    <BlockStack spacing="base">
      <Banner status="success" title={translate("impact", {value: estimate.toFixed(2)})}>
        {translate("packaging")}
      </Banner>
      {error && <Banner status="critical">{error}</Banner>}
      {merchantConfig.carbonNeutralEnabled === true && (
        <Checkbox checked={selected} disabled={busy} onChange={changeOffset}>
          {translate("carbon_neutral")}
        </Checkbox>
      )}
      {merchantConfig.carbonNeutralEnabled === true && !settings.offsetVariantId && <Text size="small" appearance="subdued">{translate("offset_sandbox")}</Text>}
    </BlockStack>
  );
}
