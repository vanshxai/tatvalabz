import TemplateRegistry from "./TemplateRegistry";
import { resolveNodeIcon } from "./IconCatalog";

const templateDerivedComponents = TemplateRegistry.reduce((acc, template) => {
  template.nodes.forEach((node) => {
    if (node.type !== "custom_formula") return;
    const key = `template_${template.id}_${node.id}`;
    const label = node.data?.label || `${template.name} Node`;
    acc[key] = {
      label,
      icon: resolveNodeIcon({
        customIcon: node.data?.customIcon || "",
        configIcon: node.data?.icon || "",
        type: node.type,
        label,
      }),
      inputs: node.data?.customInputs || [],
      outputs: node.data?.customOutputs || [],
      formulas: node.data?.customFormulas || {},
      defaultParams: node.data?.defaultParams || {},
    };
  });
  return acc;
}, {});

const templateFormulaLibrary = TemplateRegistry.flatMap((template) =>
  template.nodes
    .filter((node) => node.type === "custom_formula")
    .map((node) => {
      const outputs = Array.isArray(node.data?.customOutputs) && node.data.customOutputs.length
        ? node.data.customOutputs
        : ["out"];
      const formulas = node.data?.customFormulas || {};
      const output = outputs[0];
      return {
        id: `template_${template.id}_${node.id}`,
        label: node.data?.label || `${template.name} Node`,
        inputs: node.data?.customInputs || [],
        expression: formulas[output] || "",
        output,
      };
    })
    .filter((item) => item.expression)
);

const getTemplateComponentKey = (templateId, nodeId) => {
  const key = `template_${templateId}_${nodeId}`;
  return templateDerivedComponents[key] ? key : null;
};

export { templateDerivedComponents, templateFormulaLibrary, getTemplateComponentKey };
