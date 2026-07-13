import {reactExtension, AdminBlock, BlockStack, Text, Badge} from "@shopify/ui-extensions-react/admin";

export default reactExtension("admin.order-details.block.render", () => <OrderImpact />);

function OrderImpact() {
  return (
    <AdminBlock title="EcoTraceIT">
      <BlockStack gap="base">
        <Badge tone="success">Sustainability data active</Badge>
        <Text>La stima CO₂e e il packaging vengono salvati nei metafield ecotraceit dell&apos;ordine.</Text>
        <Text>Apri EcoTraceIT per report, dettaglio prodotti e compliance.</Text>
      </BlockStack>
    </AdminBlock>
  );
}
