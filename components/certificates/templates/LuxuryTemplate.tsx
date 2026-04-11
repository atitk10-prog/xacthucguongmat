import React, { useRef, useState, useEffect } from 'react';
import { CertificateTemplateProps } from './types';

const LuxuryTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [resizingId, setResizingId] = useState<string | null>(null);
    const [initialY, setInitialY] = useState(0);
    const [initialScale, setInitialScale] = useState(1);
    const [showGuideline, setShowGuideline] = useState(false);

    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        if (!isEditable) return;
        e.preventDefault();
        setDraggingId(id);
    };

    const handleResizeStart = (e: React.MouseEvent, id: string, currentScale: number) => {
        if (!isEditable) return;
        e.preventDefault();
        e.stopPropagation();
        setResizingId(id);
        setInitialY(e.clientY);
        setInitialScale(currentScale);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current || !onLabelChange) return;

            if (draggingId) {
                const rect = containerRef.current.getBoundingClientRect();
                let x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                if (Math.abs(x - 50) < 1.5) { x = 50; setShowGuideline(true); } else { setShowGuideline(false); }
                onLabelChange(`pos_${draggingId}`, `${Math.max(0, Math.min(100, x))},${Math.max(0, Math.min(100, y))}`);
            } else if (resizingId) {
                const deltaY = e.clientY - initialY;
                const newScale = Math.max(0.2, initialScale + (deltaY / 150));
                onLabelChange(`style_${resizingId}_scale`, newScale.toFixed(2));
            }
        };

        const handleMouseUp = () => { setDraggingId(null); setResizingId(null); setShowGuideline(false); };

        if (draggingId || resizingId) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingId, resizingId, initialY, initialScale, onLabelChange]);

    const getPos = (id: string, defX: number, defY: number) => {
        const pos = customConfig?.positions?.[id];
        if (pos) return { left: `${pos.x}%`, top: `${pos.y}%` };
        return { left: `${defX}%`, top: `${defY}%` };
    };

    const getStyle = (id: string) => customConfig?.elementStyles?.[id] || {};

    const DraggableBox = ({ id, children, defPos, ...rest }: { id: string, children: React.ReactNode, defPos: { x: number, y: number }, [key: string]: any }) => {
        const style = getStyle(id);
        const currentScale = style.scale || 1;

        if (!isEditable) return (
            <div className="absolute" style={{ ...getPos(id, defPos.x, defPos.y), width: 'max-content' }}>
                <div className="relative" style={{ transform: `translate(-50%, -50%) scale(${currentScale})` }}>
                    {children}
                </div>
            </div>
        );

        return (
            <div
                className={`absolute cursor-move select-none group/draggable transition-shadow ${draggingId === id ? 'z-50' : 'z-10'}`}
                style={{ ...getPos(id, defPos.x, defPos.y), width: 'max-content' }}
                onMouseDown={(e) => handleMouseDown(e, id)}
            >
                <div className={`relative border-2 border-transparent hover:border-amber-400 group-hover/draggable:border-amber-400 rounded p-1 ${draggingId === id ? 'border-amber-600 shadow-xl bg-white/10' : ''}`}
                    style={{ transform: `translate(-50%, -50%) scale(${currentScale})` }}>
                    {children}
                    <div
                        className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-600 rounded-full cursor-nwse-resize opacity-0 group-hover/draggable:opacity-100 border-2 border-white shadow-sm z-50"
                        onMouseDown={(e) => handleResizeStart(e, id, currentScale)}
                    />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[9px] px-2 py-0.5 rounded-full opacity-0 group-hover/draggable:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-sans font-bold shadow-md uppercase tracking-tighter">
                        Kéo để di chuyển
                    </div>
                </div>
            </div>
        );
    };

    const Editable = ({ val, k, className, style }: { val: string, k: string, className?: string, style?: React.CSSProperties }) => {
        if (!isEditable || !onLabelChange) return <span className={className} style={style}>{val}</span>;
        return (
            <span
                contentEditable
                suppressContentEditableWarning
                className={`${className} outline-none cursor-text bg-transparent hover:bg-black/5 focus:bg-white/50 rounded px-1 min-w-[20px] inline-block`}
                style={style}
                onBlur={(e) => onLabelChange(k, e.currentTarget.textContent || val)}
                onMouseDown={(e) => e.stopPropagation()}
            >{val}</span>
        );
    };

    const labels = {
        title: customConfig?.labels?.title || 'Certificate',
        presentedTo: customConfig?.labels?.presentedTo || 'Trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã hoàn thành xuất sắc',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'Vào sổ số: ______'
    };

    const isVisible = (field: string) => (customConfig?.visibility as any)?.[field] !== false;
    const textColor = customConfig?.textColor || '#1e293b';

    return (
        <div
            id="certificate-node"
            ref={containerRef}
            className="w-[800px] h-[566px] bg-[#fffbf0] relative mx-auto shadow-2xl overflow-hidden"
            style={{ width: '800px', height: '566px', minWidth: '800px', minHeight: '566px', color: textColor, fontFamily: "'Playfair Display', 'Times New Roman', serif" }}
        >
            {/* Background */}
            {customConfig?.bgImage ? (
                <img src={customConfig.bgImage} className="absolute inset-0 w-full h-full z-0"
                    style={{ objectFit: customConfig.bgMode || 'cover', opacity: customConfig.bgOpacity !== undefined ? customConfig.bgOpacity : 1 }} alt="Background" />
            ) : (
                <>
                    <div className="absolute inset-2 pointer-events-none z-0">
                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="0.5" y="0.5" width="99" height="99" stroke="#b49148" strokeWidth="1" fill="none" />
                        </svg>
                    </div>
                    <div className="absolute inset-4 pointer-events-none z-0">
                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="0.5" y="0.5" width="99" height="99" stroke="#b49148" strokeWidth="0.5" fill="none" />
                        </svg>
                    </div>
                    {['absolute top-2 left-2 w-16 h-16',
                      'absolute top-2 right-2 w-16 h-16 rotate-90',
                      'absolute bottom-2 left-2 w-16 h-16 -rotate-90',
                      'absolute bottom-2 right-2 w-16 h-16 rotate-180'
                    ].map((cls, i) => (
                        <div key={i} className={`${cls} pointer-events-none z-[1]`}>
                            <svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M0 4 L0 0 L4 0 L64 0 L64 4 L4 4 L4 64 L0 64 L0 4Z" fill="#b49148" />
                            </svg>
                        </div>
                    ))}
                </>
            )}

            {/* Seal */}
            {isVisible('seal') && customConfig?.sealImage && (
                <DraggableBox id="seal" defPos={{ x: 85, y: 15 }}>
                    <img src={customConfig.sealImage} className="w-24 h-24 object-contain opacity-80 pointer-events-none" alt="Seal" />
                </DraggableBox>
            )}

            {/* Default Logo */}
            {isVisible('logo') && (!customConfig?.logos || customConfig.logos.length === 0) && (
                <DraggableBox id="logo" defPos={{ x: 50, y: 12 }}>
                    <div className="relative group/logo-container">
                        <img src={customConfig?.logoImage || "/educheck_logo.png"}
                            className="h-20 w-auto object-contain drop-shadow-md pointer-events-none" alt="Logo" />
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onLabelChange('visibility_logo', 'false'); }}
                                className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/logo-container:opacity-100 transition-opacity pointer-events-auto shadow-lg hover:bg-red-600 text-sm font-bold leading-none z-[60] cursor-pointer"
                                title="Ẩn logo"
                            >×</button>
                        )}
                    </div>
                </DraggableBox>
            )}

            {/* Uploaded Logos — independent */}
            {customConfig?.logos?.map((logo, index) => (
                <DraggableBox key={`logo-${index}`} id={`logo-${index}`} defPos={{ x: 30 + index * 20, y: 12 }}>
                    <div className="relative group/single-logo">
                        <img src={logo} className="object-contain drop-shadow-sm pointer-events-none" style={{ height: `${24 * 4 * (customConfig.logoScale || 1)}px` }} alt={`Logo ${index + 1}`} />
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onLabelChange(`remove_logo_${index}`, 'true'); }}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/single-logo:opacity-100 transition-opacity pointer-events-auto shadow-md hover:bg-red-600 text-[10px] font-bold leading-none z-[60] cursor-pointer"
                                title="Xóa logo"
                            >×</button>
                        )}
                    </div>
                </DraggableBox>
            ))}

            {/* Title */}
            {isVisible('title') && (
                <DraggableBox id="title" defPos={{ x: 50, y: 27 }}>
                    <h1 className="text-5xl font-bold uppercase tracking-[0.2em] drop-shadow-sm whitespace-nowrap leading-none text-center" style={{ color: getStyle('title').color || '#b49148' }}>
                        <Editable val={labels.title} k="title" />
                    </h1>
                </DraggableBox>
            )}

            {/* Recipient */}
            {isVisible('recipient') && (
                <>
                    <DraggableBox id="presentedTo" defPos={{ x: 50, y: 40 }}>
                        <p className="text-xl italic whitespace-nowrap" style={{ color: getStyle('presentedTo').color || '#64748b' }}>
                            <Editable val={labels.presentedTo} k="presentedTo" />
                        </p>
                    </DraggableBox>
                    <DraggableBox id="recipient" defPos={{ x: 50, y: 50 }}>
                        <h2 className="text-6xl flex items-center justify-center whitespace-nowrap" style={{ color: getStyle('recipient').color || '#b49148', fontFamily: "'Dancing Script', cursive" }}>
                            {data.recipientName}
                        </h2>
                    </DraggableBox>
                </>
            )}

            {/* Event */}
            <DraggableBox id="eventStr" defPos={{ x: 50, y: 60 }}>
                <p className="text-lg italic whitespace-nowrap" style={{ color: getStyle('eventStr').color || '#64748b' }}>
                    <Editable val={labels.eventPrefix} k="eventPrefix" />
                </p>
            </DraggableBox>
            {isVisible('eventName') && (
                <DraggableBox id="eventName" defPos={{ x: 50, y: 67 }}>
                    <h3 className="text-3xl font-bold uppercase tracking-wide text-center leading-tight whitespace-nowrap" style={{ color: getStyle('eventName').color || '#1e293b' }}>
                        {data.eventName}
                    </h3>
                </DraggableBox>
            )}

            {/* Entry No — NO font-serif, inherits parent font */}
            {isVisible('entryNo') && (
                <DraggableBox id="entryNo" defPos={{ x: 20, y: 80 }}>
                    <p className="text-sm font-medium opacity-80 whitespace-nowrap" style={{ color: getStyle('entryNo').color || '#64748b' }}>
                        <Editable val={labels.entryNo} k="entryNo" />
                    </p>
                </DraggableBox>
            )}

            {/* Date — NO font-serif, inherits parent font */}
            {isVisible('date') && (
                <DraggableBox id="date" defPos={{ x: 20, y: 85 }}>
                    <p className="text-sm font-medium opacity-80 whitespace-nowrap" style={{ color: getStyle('date').color || '#64748b' }}>
                        <Editable val={labels.datePrefix} k="datePrefix" />
                    </p>
                </DraggableBox>
            )}

            {/* QR */}
            {isVisible('qr') && (
                <DraggableBox id="qr" defPos={{ x: 50, y: 85 }}>
                    <div className="flex flex-col items-center pointer-events-none">
                        <div className="bg-white p-1 border border-[#b49148]/30">
                            <img src={data.verifyQR} alt="QR" className="w-20 h-20" />
                        </div>
                    </div>
                </DraggableBox>
            )}

            {/* Signature Image */}
            {isVisible('signatureImg') && customConfig?.signatureImage && (
                <DraggableBox id="signatureImg" defPos={{ x: 80, y: 75 }}>
                    <img src={customConfig.signatureImage} className="w-32 h-auto object-contain pointer-events-none" alt="Signature" />
                </DraggableBox>
            )}

            {/* Signature Text */}
            {isVisible('signature') && (
                <DraggableBox id="signature" defPos={{ x: 80, y: 85 }}>
                    <p className="text-lg font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: getStyle('signature').color || '#b49148' }}>
                        <Editable val={labels.signature} k="signature" />
                    </p>
                </DraggableBox>
            )}

            {/* Custom Texts — supports Enter for new lines */}
            {(customConfig?.customTexts || []).map(txt => (
                <DraggableBox key={txt.id} id={txt.id} defPos={{ x: txt.x, y: txt.y }}>
                    <div className="relative group/custom-text" style={{ width: 'max-content', minWidth: '60px' }}>
                        {isEditable && onLabelChange ? (
                            <div
                                key={`edit-${txt.id}-${txt.content}`}
                                contentEditable
                                suppressContentEditableWarning
                                className="outline-none cursor-text bg-transparent hover:bg-black/5 focus:bg-white/50 rounded px-1 min-w-[60px] min-h-[1.2em]"
                                style={{
                                    fontSize: `${txt.fontSize || 18}px`,
                                    color: getStyle(txt.id).color || txt.color || textColor,
                                    textAlign: 'center',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'keep-all'
                                }}
                                onBlur={(e) => {
                                    const text = e.currentTarget.innerText || '';
                                    if (text && text !== txt.content) {
                                        onLabelChange(`customtext_${txt.id}`, text);
                                    }
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                    // Enter inserts newline (default browser behavior)
                                }}
                            >
                                {txt.content}
                            </div>
                        ) : (
                            <div style={{
                                fontSize: `${txt.fontSize || 18}px`,
                                color: getStyle(txt.id).color || txt.color || textColor,
                                textAlign: 'center',
                                whiteSpace: 'pre-wrap'
                            }}>
                                {txt.content}
                            </div>
                        )}
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onLabelChange(`delete_customtext_${txt.id}`, 'true'); }}
                                className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/custom-text:opacity-100 transition-opacity pointer-events-auto shadow-lg hover:bg-red-600 text-xs font-bold leading-none z-[60] cursor-pointer"
                                title="Xóa"
                            >×</button>
                        )}
                    </div>
                </DraggableBox>
            ))}

            {showGuideline && (
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] border-l border-dashed border-emerald-500 z-50 pointer-events-none">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[8px] px-1 rounded font-bold whitespace-nowrap">TRỤC GIỮA</div>
                </div>
            )}
        </div>
    );
};

export default LuxuryTemplate;
