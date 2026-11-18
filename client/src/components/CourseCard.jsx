import React from 'react';
import { Link } from 'react-router-dom';
import { coverClass, formatDuration, formatPrice, iconFor, LEVEL_LABEL } from '../lib/api.js';
import { Badge, DemoBadge, Progress } from './ui.jsx';

export default function CourseCard({ course, progress }) {
  if (!course) return null;
  const pct = progress?.percent ?? course.progress_percent ?? 0;
  return (
    <article className="course-card">
      <Link to={`/cursos/${course.slug}`} className={`${coverClass(course.cover_gradient)} course-cover`} aria-label={`Ver curso ${course.title}`}>
        <span className="cover-icon" aria-hidden="true">{iconFor(course.category_slug)}</span>
        <span className="cover-title">{course.title}</span>
        <span className="cover-sub">{course.category_name || course.category_slug}</span>
      </Link>
      <div className="course-card-body">
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {course.is_demo ? <DemoBadge show /> : null}
          {course.is_premium ? <Badge kind="premium">Premium</Badge> : null}
          {course.price_cents > 0 ? <Badge kind="info">{formatPrice(course.price_cents)}</Badge> : <Badge kind="free">Gratis</Badge>}
          <Badge>{LEVEL_LABEL[course.level] || course.level}</Badge>
        </div>
        <h3 className="mt-1 mb-0">
          <Link to={`/cursos/${course.slug}`}>{course.title}</Link>
        </h3>
        <p className="muted small mt-0">{course.subtitle || course.description}</p>
        <div className="course-meta">
          <span>{course.lesson_count ?? 0} lecciones</span>
          <span>·</span>
          <span>{formatDuration(course.duration_minutes)}</span>
          <span>·</span>
          <span>{course.students ?? 0} estudiantes</span>
        </div>
        {pct > 0 ? <Progress value={pct} label="Tu progreso" /> : null}
        <div className="course-foot">
          <span className="muted tiny">
            {course.instructor?.name ? `Por ${course.instructor.name}` : 'Equipo SKILLVERSE'}
          </span>
          <Link to={`/cursos/${course.slug}`} className="btn btn-primary btn-sm">
            {pct > 0 ? 'Continuar' : 'Ver curso'}
          </Link>
        </div>
      </div>
    </article>
  );
}
