import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAppDispatch } from '../store/hooks';
import { addToQueue } from '../store/queueSlice';
import { indexedDBManager } from '../services/IndexedDBManager';
import './SubmissionForm.css';

export function SubmissionForm({ onSubmitSuccess }) {
    const dispatch = useAppDispatch();
    const { register, handleSubmit, reset, formState: { errors } } = useForm();
    const [images, setImages] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files || []);
        setImages(files);
    };

    const onSubmit = async (data) => {
        setIsSubmitting(true);

        try {
            // 1. Save images to IndexedDB BEFORE dispatching to Redux
            // This keeps non-serializable Blobs out of Redux actions
            const imageIds = await Promise.all(
                images.map(async (file) => {
                    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
                    return indexedDBManager.saveImage(blob, file.name, file.type);
                })
            );

            // 2. Dispatch Redux action with only serializable data (imageIds)
            const result = await dispatch(addToQueue({
                data,
                imageIds
            })).unwrap();

            console.log('✅ Form submitted to queue:', result.id);

            // Reset form
            reset();
            setImages([]);

            // Notify parent
            if (onSubmitSuccess) {
                onSubmitSuccess(result.id);
            }

        } catch (error) {
            console.error('❌ Failed to submit form:', error);
            alert('Fehler beim Speichern: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="submission-form">
            <h2>📝 Formulareingabe</h2>

            <div className="form-group">
                <label htmlFor="title">Titel *</label>
                <input
                    id="title"
                    type="text"
                    {...register('title', { required: 'Titel ist erforderlich' })}
                    placeholder="Titel eingeben"
                />
                {errors.title && <span className="error">{errors.title.message}</span>}
            </div>

            {/* <div className="form-group">
                <label htmlFor="description">Beschreibung *</label>
                <textarea
                    id="description"
                    {...register('description', { required: 'Beschreibung ist erforderlich' })}
                    placeholder="Beschreibung eingeben"
                    rows={4}
                />
                {errors.description && <span className="error">{errors.description.message}</span>}
            </div> */}

            <div className="form-group">
                <label htmlFor="images">Bilder (optional)</label>
                <input
                    id="images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                />
                {images.length > 0 && (
                    <div className="image-preview">
                        {images.map((file, index) => (
                            <div key={index} className="preview-item">
                                <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                />
                                <span>{file.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button
                type="submit"
                className="submit-button"
                disabled={isSubmitting}
            >
                {isSubmitting ? '⏳ Speichern...' : '📤 Absenden'}
            </button>
        </form>
    );
}
