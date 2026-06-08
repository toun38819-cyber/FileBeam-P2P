export const pageTransition = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: { duration: 0.25 } }, exit: { opacity: 0, y: -10, transition: { duration: 0.15 } } };
export const cardHover = { whileHover: { scale: 1.01, transition: { duration: 0.2 } } };
export const staggerChildren = { animate: { transition: { staggerChildren: 0.05 } } };
