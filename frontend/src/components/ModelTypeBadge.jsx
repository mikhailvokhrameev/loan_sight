const TYPE_COLORS = {
  lgbm:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  xgb:      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  catboost: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  logreg:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function ModelTypeBadge({ type }) {
  const color = TYPE_COLORS[type?.toLowerCase()] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${color}`}>
      {type}
    </span>
  );
}
