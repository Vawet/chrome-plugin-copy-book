const e = React.createElement;

function CardRotate({ children, onSendToBack, sensitivity, disableDrag = false }) {
    const motionObj = window.Motion || {};
    const { motion, useMotionValue, useTransform } = motionObj;

    if (!motion) return children;

    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useTransform(y, [-100, 100], [60, -60]);
    const rotateY = useTransform(x, [-100, 100], [-60, 60]);

    function handleDragEnd(_, info) {
        if (Math.abs(info.offset.x) > sensitivity || Math.abs(info.offset.y) > sensitivity) {
            onSendToBack();
        } else {
            x.set(0);
            y.set(0);
        }
    }

    if (disableDrag) {
        return e(motion.div, {
            className: "card-rotate-disabled",
            style: { x: 0, y: 0 }
        }, children);
    }

    return e(motion.div, {
        className: "card-rotate",
        style: { x, y, rotateX, rotateY, position: 'absolute', width: '100%', height: '100%' },
        drag: true,
        dragConstraints: { top: 0, right: 0, bottom: 0, left: 0 },
        dragElastic: 0.6,
        whileTap: { cursor: 'grabbing' },
        onDragEnd: handleDragEnd
    }, children);
}

function Stack({ images, sensitivity = 200, animationConfig = { stiffness: 260, damping: 20 }, onDelete }) {
    const [stack, setStack] = React.useState([]);
    const motionObj = window.Motion || {};
    const { motion } = motionObj;

    React.useEffect(() => {
        const items = images.map(img => ({
            id: img.id,
            url: URL.createObjectURL(img.blob)
        }));
        setStack(items);
        return () => items.forEach(item => URL.revokeObjectURL(item.url));
    }, [images]);

    const sendToBack = (id) => {
        setStack(prev => {
            const newStack = [...prev];
            const index = newStack.findIndex(card => card.id === id);
            if (index === -1) return prev;
            const [card] = newStack.splice(index, 1);
            newStack.unshift(card);
            return newStack;
        });
    };

    if (!motion) return e('div', null, 'Framer Motion 未加载');
    if (stack.length === 0) return e('div', { style: { textAlign: 'center', color: '#64748b', padding: '40px' } }, '暂无图片');

    return e('div', { 
        className: 'stack-container', 
        style: { 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            position: 'relative'
        } 
    },
        stack.map((card, index) => {
            const isTop = index === stack.length - 1;
            return e(CardRotate, {
                key: card.id,
                onSendToBack: () => sendToBack(card.id),
                sensitivity: sensitivity,
                disableDrag: false
            }, 
                e(motion.div, {
                    className: "card",
                    onClick: () => sendToBack(card.id),
                    animate: {
                        rotateZ: (stack.length - index - 1) * 4,
                        scale: 1 + index * 0.06 - stack.length * 0.06,
                        transformOrigin: '90% 90%'
                    },
                    initial: false,
                    transition: {
                        type: 'spring',
                        stiffness: animationConfig.stiffness,
                        damping: animationConfig.damping
                    },
                    style: {
                        maxWidth: '540px',
                        maxHeight: '540px',
                        width: 'auto',
                        height: 'auto',
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '1.5rem',
                        overflow: 'hidden',
                        background: 'white',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                        border: '6px solid white',
                        cursor: 'pointer'
                    }
                }, [
                    e('img', { 
                        key: 'img',
                        src: card.url, 
                        style: { 
                            maxWidth: '100%', 
                            maxHeight: '100%', 
                            display: 'block',
                            objectFit: 'contain', 
                            pointerEvents: 'none' 
                        } 
                    }),
                    isTop && e('div', {
                        key: 'del',
                        className: 'img-delete-btn',
                        title: '删除图片',
                        onClick: (ev) => {
                            ev.stopPropagation();
                            if (confirm('确定删除这张图片吗？')) {
                                onDelete(card.id);
                            }
                        },
                        style: {
                            position: 'absolute',
                            top: '15px',
                            right: '15px',
                            width: '32px',
                            height: '32px',
                            background: 'rgba(239, 68, 68, 0.9)',
                            color: 'white',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            cursor: 'pointer',
                            zIndex: 100,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                        }
                    }, '×')
                ])
            );
        })
    );
}

let stackRoot = null;
window.renderStack = (images, onDelete) => {
    const container = document.getElementById('react-stack-root');
    if (!container) return;
    if (!stackRoot) {
        stackRoot = ReactDOM.createRoot(container);
    }
    stackRoot.render(e(Stack, { images, onDelete }));
};
