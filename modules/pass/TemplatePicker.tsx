import { makeStyles } from '@navch-ui/styles';
import { Box, Text, Checkbox } from '@navch-ui/core';

export interface TemplateInfo {
  readonly templateId: string;
  readonly description: string;
}

export interface Props {
  readonly templates: readonly TemplateInfo[];
  readonly onSelect: (templateId: string) => void;
  readonly isSelected: (templateId: string) => boolean;
}

export const TemplatePicker: React.FC<Props> = props => {
  const { templates, onSelect, isSelected } = props;
  const { styles } = useStyles();

  return (
    <Box grid classes={styles.container}>
      {templates.map(({ templateId, description }) => (
        <Box
          flex
          padded
          interactive
          key={templateId}
          classes={styles.item}
          onClick={() => onSelect(templateId)}
        >
          <Checkbox checked={isSelected(templateId)} />
          <Text fluid ph={4} ellipsis textAlign="center" title={description}>
            {description}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

const useStyles = makeStyles(theme => ({
  container: {
    gap: theme.spacing(2),
    gridColumnStart: 1,
    gridTemplateColumns: 'repeat(2, 50%)',
  },
  item: {
    borderRadius: theme.border.radius,
    backgroundColor: theme.color.ui.tint1,
  },
}));
