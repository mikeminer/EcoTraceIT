import {reactExtension, AdminBlock, BlockStack, Text, Badge} from "@shopify/ui-extensions-react/admin";

export default reactExtension("admin.order-details.block.render", () => <OrderImpact />);

function OrderImpact() {
  return (
    <AdminBlock title="EcoPack AI">
      <BlockStack gap="base">
        <Badge tone="success">Sustainability data active</Badge>
        <Text>La stima CO₂e e il packaging vengono salvati nei metafield ecopack_ai dell&apos;ordine.</Text>
        <Text>Apri EcoPack AI per report, dettaglio prodotti e compliance.</Text>
      </BlockStack>
    </AdminBlock>
  );
}
