import { makeStyles } from '@navch-ui/styles';
import { Box, Text } from '@navch-ui/core';

export interface TemplateInfo {
  readonly templateId: string;
  readonly description: string;
}

export interface Props {
  readonly templates: readonly TemplateInfo[];
  readonly onSelect: (templateId: string) => void;
}

export const TemplatePicker: React.FC<Props> = props => {
  const { templates, onSelect } = props;
  const { styles } = useStyles();

  return (
    <Box grid classes={styles.container}>
      {templates.map(({ templateId, description }) => (
        <Box
          key={templateId}
          flex
          padded
          interactive
          classes={styles.item}
          onClick={() => onSelect(templateId)}
        >
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

    [theme.breakpoint.mediumAndAbove]: {
      gridTemplateColumns: 'repeat(2, 50%)',
    },
    [theme.breakpoint.medium]: {
      gridTemplateColumns: 'repeat(1, 100%)',
    },
  },
  item: {
    borderRadius: theme.border.radius,
    backgroundColor: theme.color.ui.tint1,
  },
}));
