import type { CourseRoadmapStructure } from './course-types'

export function courseStepCounts(structure: Pick<CourseRoadmapStructure, 'nodes'>) {
  const checkpointCount = structure.nodes.filter((node) => node.kind === 'capstone').length
  return {
    lessonCount: structure.nodes.length - checkpointCount,
    checkpointCount,
    learningStepCount: structure.nodes.length,
  }
}
