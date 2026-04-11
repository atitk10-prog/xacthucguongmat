import React, { useRef, useState, useEffect } from 'react';
import { CertificateTemplateProps } from './types';

const PAPER_DIMENSIONS = {
    A4: { width: 1123, height: 794 }, // Landscape px @ 96dpi
    A5: { width: 794, height: 559 },
    A3: { width: 1587, height: 1123 },
    B4: { width: 1335, height: 945 } // Approx
};

const CustomTemplate: React.FC<CertificateTemplateProps> = ({ data, customConfig, isEditable = false, onLabelChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const size = customConfig?.paperSize || 'A4';
    const orientation = customConfig?.orientation || 'landscape';

    let baseDim = PAPER_DIMENSIONS[size as keyof typeof PAPER_DIMENSIONS] || PAPER_DIMENSIONS.A4;

    // Swap dimensions if portrait
    const width = orientation === 'portrait' ? baseDim.height : baseDim.width;
    const height = orientation === 'portrait' ? baseDim.width : baseDim.height;

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

                if (Math.abs(x - 50) < 1.5) {
                    x = 50;
                    setShowGuideline(true);
                } else {
                    setShowGuideline(false);
                }

                const boundedX = Math.max(0, Math.min(100, x));
                const boundedY = Math.max(0, Math.min(100, y));
                onLabelChange(`pos_${draggingId}`, `${boundedX},${boundedY}`);
            } else if (resizingId) {
                const deltaY = e.clientY - initialY;
                const newScale = Math.max(0.2, initialScale + (deltaY / 150));
                onLabelChange(`style_${resizingId}_scale`, newScale.toFixed(2));
            }
        };

        const handleMouseUp = () => {
            setDraggingId(null);
            setResizingId(null);
            setShowGuideline(false);
        };

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

    const getStyle = (id: string) => {
        return customConfig?.elementStyles?.[id] || {};
    };

    const DraggableBox = ({ id, children, defPos, ...props }: { id: string, children: React.ReactNode, defPos: { x: number, y: number }, [key: string]: any }) => {
        const style = getStyle(id);
        const currentScale = style.scale || 1;

        if (!isEditable) return (
            <div className="absolute" style={{ ...getPos(id, defPos.x, defPos.y), width: 'max-content' }}>
                <div className="relative transform -translate-x-1/2 -translate-y-1/2" style={{ transform: `translate(-50%, -50%) scale(${currentScale})` }}>
                    {children}
                </div>
            </div>
        );

        return (
            <div
                {...props}
                className={`absolute cursor-move select-none group/draggable transition-shadow ${draggingId === id ? 'z-50' : 'z-10'}`}
                style={{ ...getPos(id, defPos.x, defPos.y), width: 'max-content' }}
                onMouseDown={(e) => handleMouseDown(e, id)}
            >
                <div className={`relative transform -translate-x-1/2 -translate-y-1/2 border-2 border-transparent hover:border-indigo-400 group-hover/draggable:border-indigo-400 rounded p-1 ${draggingId === id ? 'border-indigo-600 shadow-xl bg-white/10' : ''}`}
                    style={{ transform: `translate(-50%, -50%) scale(${currentScale})` }}>
                    {children}

                    {/* Resize Handle */}
                    <div
                        className="absolute -bottom-1 -right-1 w-3 h-3 bg-indigo-600 rounded-full cursor-nwse-resize opacity-0 group-hover/draggable:opacity-100 border-2 border-white shadow-sm z-50"
                        onMouseDown={(e) => handleResizeStart(e, id, currentScale)}
                    />

                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded-full opacity-0 group-hover/draggable:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-sans font-bold shadow-md uppercase tracking-tighter">
                        Kéo để di chuyển / Resize
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

    const getFontFamily = (style?: string) => {
        switch (style) {
            case 'handwriting': return "'Dancing Script', cursive";
            case 'sans': return "'Arimo', sans-serif";
            case 'times': return "'Times New Roman', serif";
            case 'cinzel': return "'Cinzel', serif";
            case 'cormorant': return "'Cormorant Garamond', serif";
            case 'greatvibes': return "'Great Vibes', cursive";
            case 'alexbrush': return "'Alex Brush', cursive";
            case 'pinyon': return "'Pinyon Script', cursive";
            case 'librebaskerville': return "'Libre Baskerville', serif";
            case 'bevietnam': return "'Be Vietnam Pro', sans-serif";
            case 'serif': default: return "'Playfair Display', serif";
        }
    };

    const mainFont = getFontFamily(customConfig?.fontStyle);
    const titleFont = getFontFamily(customConfig?.titleFont || customConfig?.fontStyle);
    const recipientFont = getFontFamily(customConfig?.recipientFont || customConfig?.titleFont || customConfig?.fontStyle);
    const textColor = customConfig?.textColor || '#1e293b';

    const labels = {
        title: customConfig?.labels?.title || 'Certificate',
        presentedTo: customConfig?.labels?.presentedTo || 'Trao tặng cho',
        eventPrefix: customConfig?.labels?.eventPrefix || 'Đã tham gia sự kiện',
        datePrefix: customConfig?.labels?.datePrefix || 'Ngày cấp',
        signature: customConfig?.labels?.signature || 'Ban Tổ Chức',
        entryNo: customConfig?.labels?.entryNo || 'Vào sổ số: ______'
    };

    const isVisible = (field: keyof NonNullable<typeof customConfig>['visibility']) => {
        if (field === 'qr') {
            return customConfig?.visibility?.[field] === true;
        }
        return customConfig?.visibility?.[field] !== false;
    };

    return (
        <div
            id="certificate-node"
            ref={containerRef}
            className="bg-white relative overflow-hidden mx-auto shadow-2xl"
            style={{
                width: `${width}px`,
                height: `${height}px`,
                minWidth: `${width}px`,
                minHeight: `${height}px`,
                color: textColor,
                fontFamily: mainFont
            }}
        >
            {/* Custom Background */}
            {customConfig?.bgImage ? (
                <img
                    src={customConfig.bgImage}
                    className="absolute inset-0 w-full h-full z-0"
                    style={{
                        objectFit: customConfig.bgMode || 'cover',
                        opacity: customConfig.bgOpacity !== undefined ? customConfig.bgOpacity : 1
                    }}
                    alt="Background"
                />
            ) : (
                <div className="absolute inset-0 border-[20px] border-double border-slate-300 z-0 bg-slate-50"></div>
            )}

            {/* Seal */}
            {isVisible('seal') && customConfig?.sealImage && (
                <DraggableBox id="seal" defPos={{ x: 85, y: 15 }}>
                    <img src={customConfig.sealImage} className="w-32 h-32 object-contain opacity-90 drop-shadow-md pointer-events-none" alt="Seal" />
                </DraggableBox>
            )}

            {/* Logos — Each logo gets its own DraggableBox for independent positioning */}
            {isVisible('logo') && customConfig?.logoImage && (!customConfig.logos || customConfig.logos.length === 0) && (
                <DraggableBox id="logo" defPos={{ x: 50, y: 10 }}>
                    <div className="relative group/logo-container">
                        <img src={customConfig.logoImage} className="object-contain drop-shadow-sm h-20 w-auto pointer-events-none" alt="Default Logo" />
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onLabelChange('visibility_logo', 'false');
                                }}
                                className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/logo-container:opacity-100 transition-opacity pointer-events-auto shadow-lg hover:bg-red-600 text-sm font-bold leading-none z-[60] cursor-pointer"
                                title="Ẩn logo"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </DraggableBox>
            )}
            {/* Uploaded Logos — independent from default logo visibility */}
            {customConfig?.logos?.map((logo, index) => (
                <DraggableBox key={`logo-${index}`} id={`logo-${index}`} defPos={{ x: 30 + index * 20, y: 10 }}>
                    <div className="relative group/single-logo">
                        <img src={logo} className="object-contain drop-shadow-sm pointer-events-none" style={{ height: `${24 * 4 * (customConfig.logoScale || 1)}px` }} alt={`Logo ${index + 1}`} />
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onLabelChange(`remove_logo_${index}`, 'true');
                                }}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/single-logo:opacity-100 transition-opacity pointer-events-auto shadow-md hover:bg-red-600 text-[10px] font-bold leading-none z-[60] cursor-pointer"
                                title="Xóa logo này"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </DraggableBox>
            ))}

            {/* Title */}
            {isVisible('title') && (
                <DraggableBox id="title" defPos={{ x: 50, y: 15 }}>
                    <h1 className="font-bold uppercase tracking-widest leading-none text-center whitespace-nowrap"
                        style={{ color: getStyle('title').color || textColor, fontFamily: titleFont, fontSize: `${(orientation === 'portrait' ? 3.5 : 4.5)}rem` }}>
                        <Editable val={labels.title} k="title" />
                    </h1>
                </DraggableBox>
            )}

            {/* Recipient */}
            {isVisible('recipient') && (
                <>
                    <DraggableBox id="presentedTo" defPos={{ x: 50, y: 30 }}>
                        <p className="text-2xl italic font-light opacity-90 whitespace-nowrap" style={{ color: getStyle('presentedTo').color || textColor, fontFamily: mainFont }}>
                            <Editable val={labels.presentedTo} k="presentedTo" />
                        </p>
                    </DraggableBox>
                    <DraggableBox id="recipient" defPos={{ x: 50, y: 40 }}>
                        <h2 className="text-6xl font-bold py-2 px-8 whitespace-nowrap" style={{ color: getStyle('recipient').color || textColor, fontFamily: recipientFont, textShadow: '1px 1px 2px rgba(0,0,0,0.1)' }}>
                            {data.recipientName}
                        </h2>
                    </DraggableBox>
                </>
            )}

            {/* Event */}
            {isVisible('eventName') && (
                <>
                    {isVisible('eventStr') && (
                        <DraggableBox id="eventStr" defPos={{ x: 50, y: 52 }}>
                            <p className="text-xl opacity-80 whitespace-nowrap" style={{ color: getStyle('eventStr').color || textColor, fontFamily: mainFont }}>
                                <Editable val={labels.eventPrefix} k="eventPrefix" />
                            </p>
                        </DraggableBox>
                    )}
                    <DraggableBox id="eventName" defPos={{ x: 50, y: 60 }}>
                        <h3 className="text-4xl font-bold text-center" style={{ color: getStyle('eventName').color || textColor, fontFamily: titleFont }}>{data.eventName}</h3>
                    </DraggableBox>
                </>
            )}

            {/* Footer */}
            {isVisible('entryNo') && (
                <DraggableBox id="entryNo" defPos={{ x: 20, y: 80 }}>
                    <p className="text-base font-medium whitespace-nowrap text-left opacity-80" style={{
                        color: getStyle('entryNo').color || textColor,
                        fontFamily: mainFont
                    }}>
                        <Editable val={labels.entryNo.replace(/_/g, '.')} k="entryNo" />
                    </p>
                </DraggableBox>
            )}
            {isVisible('date') && (
                <DraggableBox id="date" defPos={{ x: 20, y: 85 }}>
                    <div className="text-base font-medium whitespace-nowrap text-left opacity-80" style={{
                        color: getStyle('date').color || textColor,
                        fontFamily: mainFont
                    }}>
                        <Editable val={labels.datePrefix.replace(/_/g, '.')} k="datePrefix" />
                    </div>
                </DraggableBox>
            )}

            {/* QR */}
            {isVisible('qr') && (
                <DraggableBox id="qr" defPos={{ x: 50, y: 85 }}>
                    <div className="flex flex-col items-center pointer-events-none">
                        <img src={data.verifyQR} className="w-24 h-24 border-2 border-white shadow-sm" alt="QR" />
                    </div>
                </DraggableBox>
            )}

            {/* Signature & Seal */}
            {isVisible('signatureImg') && customConfig.signatureImage && (
                <DraggableBox id="signatureImg" defPos={{ x: 80, y: 75 }}>
                    <img
                        src={customConfig.signatureImage}
                        className="w-48 h-auto object-contain z-20 pointer-events-none"
                        style={{ display: 'block' }}
                        alt="Sig"
                    />
                </DraggableBox>
            )}

            {isVisible('signature') && (
                <DraggableBox id="signature" defPos={{ x: 80, y: 88 }}>
                    <p className="text-xl font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: getStyle('signature').color || textColor, fontFamily: mainFont }}>
                        <Editable val={labels.signature} k="signature" />
                    </p>
                </DraggableBox>
            )}


            {/* Custom Texts */}
            {(customConfig.customTexts || []).map(txt => (
                <DraggableBox key={txt.id} id={txt.id} defPos={{ x: txt.x, y: txt.y }}>
                    <div className="relative group/custom-text">
                        {isEditable && onLabelChange ? (
                            <div
                                contentEditable
                                suppressContentEditableWarning
                                className="outline-none cursor-text bg-transparent hover:bg-black/5 focus:bg-white/50 rounded px-1 min-w-[40px] min-h-[1.2em]"
                                style={{
                                    fontSize: `${txt.fontSize || 18}px`,
                                    color: getStyle(txt.id).color || txt.color || textColor,
                                    fontFamily: getFontFamily(txt.fontStyle),
                                    textAlign: 'center',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.4
                                }}
                                onBlur={(e) => {
                                    // Use innerHTML and convert <br> to \n for storage
                                    const html = e.currentTarget.innerHTML || '';
                                    const text = html
                                        .replace(/<br\s*\/?>/gi, '\n')
                                        .replace(/<[^>]*>/g, '')
                                        .replace(/&nbsp;/g, ' ')
                                        .replace(/&amp;/g, '&')
                                        .replace(/&lt;/g, '<')
                                        .replace(/&gt;/g, '>');
                                    onLabelChange(`customtext_${txt.id}`, text || txt.content);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    // Allow Enter for new lines
                                    if (e.key === 'Enter') {
                                        e.stopPropagation();
                                        // Don't prevent default — let browser insert <br>
                                    }
                                }}
                                dangerouslySetInnerHTML={{ __html: txt.content.replace(/\n/g, '<br>') }}
                            />
                        ) : (
                            <div style={{
                                fontSize: `${txt.fontSize || 18}px`,
                                color: getStyle(txt.id).color || txt.color || textColor,
                                fontFamily: getFontFamily(txt.fontStyle),
                                textAlign: 'center',
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.4
                            }}>
                                {txt.content}
                            </div>
                        )}
                        {/* Delete button for custom text */}
                        {isEditable && onLabelChange && (
                            <button
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onLabelChange(`delete_customtext_${txt.id}`, 'true');
                                }}
                                className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/custom-text:opacity-100 transition-opacity pointer-events-auto shadow-lg hover:bg-red-600 text-xs font-bold leading-none z-[60] cursor-pointer"
                                title="Xóa văn bản này"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </DraggableBox>
            ))}

            {/* Alignment Guideline (Center) */}
            {showGuideline && (
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] border-l border-dashed border-emerald-500 z-50 pointer-events-none">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[8px] px-1 rounded font-bold whitespace-nowrap">
                        TRỤC GIỮA
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomTemplate;
