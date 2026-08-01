import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env.local') })

import pg from 'pg'

const API_BASE = 'http://localhost:3000'

async function runTests() {
  console.log('🧪 Starting WLYL Curriculum E2E Integration & Verification Tests...\n')
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env.local')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  let schoolAId: number | null = null
  let schoolBId: number | null = null

  try {
    // 1. Database Setup: Create 2 temporary test schools
    console.log('🔧 Setting up temporary schools in database...')
    
    // Create School A
    const schoolARes = await pool.query(
      `INSERT INTO schools (name, type, city, country, email, status, school_code)
       VALUES ('Curriculum Test School A', 'Private', 'TestCity', 'TestCountry', 'test_school_a@wlyl.edu', 'active', 'wlyl-test-a')
       RETURNING id`
    )
    schoolAId = schoolARes.rows[0].id
    
    // Create School B
    const schoolBRes = await pool.query(
      `INSERT INTO schools (name, type, city, country, email, status, school_code)
       VALUES ('Curriculum Test School B', 'Private', 'TestCity', 'TestCountry', 'test_school_b@wlyl.edu', 'active', 'wlyl-test-b')
       RETURNING id`
    )
    schoolBId = schoolBRes.rows[0].id

    console.log(`   ✓ Created School A (ID: ${schoolAId})`)
    console.log(`   ✓ Created School B (ID: ${schoolBId})\n`)

    // 2. Fetch a master subject from the seeded catalog
    const masterSubRes = await pool.query(
      `SELECT * FROM master_subjects WHERE board = 'CBSE' AND grade = '10' AND subject_name = 'Mathematics' LIMIT 1`
    )
    if (masterSubRes.rows.length === 0) {
      throw new Error('❌ CBSE Grade 10 Mathematics master subject not found! Ensure seed-master-syllabus has run.')
    }
    const masterSubject = masterSubRes.rows[0]
    console.log(`📚 Found Master Subject: ${masterSubject.board} Grade ${masterSubject.grade} - ${masterSubject.subject_name} (ID: ${masterSubject.id})\n`)

    // =========================================================================
    // E2E Test 1: Subscribe School A to the master subject
    // =========================================================================
    console.log('👉 [Test 1] Subscribing School A to Master Subject...')
    const subAResponse = await fetch(`${API_BASE}/api/school/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolAId,
        master_subject_id: masterSubject.id
      })
    })

    if (!subAResponse.ok) {
      const errText = await subAResponse.text()
      throw new Error(`Failed to subscribe School A: ${errText}`)
    }
    const subAData = await subAResponse.json()
    const schoolSubjectIdA = subAData.school_subject_id
    console.log(`   ✓ School A Subscribed! Created school_subject_id: ${schoolSubjectIdA}\n`)

    // =========================================================================
    // E2E Test 2: Verify Chapters, Topics, Resources & Tasks are cloned correctly
    // =========================================================================
    console.log('👉 [Test 2] Verifying Cloned Syllabus Structure for School A...')
    const fetchAResponse = await fetch(`${API_BASE}/api/school/subjects?school_id=${schoolAId}&include_details=true`)
    if (!fetchAResponse.ok) {
      throw new Error(`Failed to fetch School A subjects: ${await fetchAResponse.text()}`)
    }
    const fetchAData = await fetchAResponse.json()
    const schoolSubjects = fetchAData.subjects
    
    // Find our subscribed subject
    const subA = schoolSubjects.find((s: any) => s.id === schoolSubjectIdA)
    if (!subA) {
      throw new Error(`Subscribed subject ${schoolSubjectIdA} not returned in subjects list`)
    }

    console.log(`   ✓ Found Subscribed Subject: "${subA.subject_name}"`)
    
    if (!subA.chapters || subA.chapters.length === 0) {
      throw new Error('Syllabus cloning failed: No chapters cloned!')
    }
    console.log(`   ✓ Cloned Chapters Count: ${subA.chapters.length}`)

    const firstChapter = subA.chapters[0]
    console.log(`   ✓ Chapter: "${firstChapter.chapter_name}"`)
    
    if (firstChapter.is_custom !== false) {
      throw new Error('Cloned chapter must have is_custom = false')
    }

    if (!firstChapter.topics || firstChapter.topics.length === 0) {
      throw new Error('Syllabus cloning failed: No topics cloned under chapter!')
    }
    console.log(`   ✓ Cloned Topics Count in Chapter 1: ${firstChapter.topics.length}`)
    
    const firstTopic = firstChapter.topics[0]
    console.log(`   ✓ Topic: "${firstTopic.topic_name}" (is_custom = ${firstTopic.is_custom})`)
    
    if (firstTopic.is_custom !== false) {
      throw new Error('Cloned topic must have is_custom = false')
    }

    if (!firstTopic.resources || firstTopic.resources.length === 0) {
      throw new Error('Syllabus cloning failed: No resources cloned under topic!')
    }
    console.log(`   ✓ Cloned Resources Count: ${firstTopic.resources.length}`)
    console.log(`     - Resource 1: ${firstTopic.resources[0].title} (${firstTopic.resources[0].resource_type})`)

    if (!firstChapter.tasks || firstChapter.tasks.length === 0) {
      throw new Error('Syllabus cloning failed: No tasks cloned under chapter!')
    }
    console.log(`   ✓ Cloned Tasks Count: ${firstChapter.tasks.length}`)
    
    const mandatoryTask = firstChapter.tasks.find((t: any) => t.is_mandatory)
    const optionalTask = firstChapter.tasks.find((t: any) => !t.is_mandatory)

    if (!mandatoryTask) {
      throw new Error('Mandatory task was not cloned properly')
    }
    console.log(`     - Mandatory Task: "${mandatoryTask.title}" (is_mandatory = ${mandatoryTask.is_mandatory}, is_active = ${mandatoryTask.is_active})`)
    
    if (!optionalTask) {
      throw new Error('Optional task was not cloned properly')
    }
    console.log(`     - Optional Task: "${optionalTask.title}" (is_mandatory = ${optionalTask.is_mandatory}, is_active = ${optionalTask.is_active})\n`)

    // =========================================================================
    // E2E Test 3: Guardrail - Attempt to update/rename a locked board topic
    // =========================================================================
    console.log('👉 [Test 3] Guardrail Test: Attempting to Rename a Board Topic (Should be Blocked)...')
    const renameTopicResponse = await fetch(`${API_BASE}/api/syllabus/${firstTopic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolAId,
        topic_name: 'Renamed Board Topic (HACKED!)'
      })
    })

    console.log(`   ✓ Status Code Returned: ${renameTopicResponse.status}`)
    if (renameTopicResponse.status !== 403) {
      throw new Error(`Guardrail FAILED: Rename of board topic was not blocked! Expected 403, got ${renameTopicResponse.status}`)
    }
    const renameErr = await renameTopicResponse.json()
    console.log(`   ✓ Success! Blocked with expected message: "${renameErr.error}"\n`)

    // =========================================================================
    // E2E Test 4: Guardrail - Attempt to delete a locked board topic
    // =========================================================================
    console.log('👉 [Test 4] Guardrail Test: Attempting to Delete a Board Topic (Should be Blocked)...')
    const deleteTopicResponse = await fetch(`${API_BASE}/api/syllabus/${firstTopic.id}?school_id=${schoolAId}`, {
      method: 'DELETE'
    })

    console.log(`   ✓ Status Code Returned: ${deleteTopicResponse.status}`)
    if (deleteTopicResponse.status !== 403) {
      throw new Error(`Guardrail FAILED: Delete of board topic was not blocked! Expected 403, got ${deleteTopicResponse.status}`)
    }
    const deleteErr = await deleteTopicResponse.json()
    console.log(`   ✓ Success! Blocked with expected message: "${deleteErr.error}"\n`)

    // =========================================================================
    // E2E Test 5: Guardrail - Attempt to deactivate a mandatory board task
    // =========================================================================
    console.log('👉 [Test 5] Guardrail Test: Attempting to Deactivate a Mandatory Task (Should be Blocked)...')
    const deactivateMandatoryResponse = await fetch(`${API_BASE}/api/school/tasks/${mandatoryTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_active: false
      })
    })

    console.log(`   ✓ Status Code Returned: ${deactivateMandatoryResponse.status}`)
    if (deactivateMandatoryResponse.status !== 403) {
      throw new Error(`Guardrail FAILED: Deactivation of mandatory task was not blocked! Expected 403, got ${deactivateMandatoryResponse.status}`)
    }
    const deactivateMandatoryErr = await deactivateMandatoryResponse.json()
    console.log(`   ✓ Success! Blocked with expected message: "${deactivateMandatoryErr.error}"\n`)

    // =========================================================================
    // E2E Test 6: Toggle Option - Deactivate an optional board task
    // =========================================================================
    console.log('👉 [Test 6] Option Test: Deactivating an Optional Task (Should Succeed)...')
    const deactivateOptionalResponse = await fetch(`${API_BASE}/api/school/tasks/${optionalTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_active: false
      })
    })

    if (!deactivateOptionalResponse.ok) {
      throw new Error(`Failed to deactivate optional task: ${await deactivateOptionalResponse.text()}`)
    }
    const deactivateOptionalData = await deactivateOptionalResponse.json()
    console.log(`   ✓ Success! Task Updated: "${deactivateOptionalData.task.title}" (is_active = ${deactivateOptionalData.task.is_active})\n`)

    // =========================================================================
    // E2E Test 7: Customization - Create local Custom Chapter, Topic, and Task
    // =========================================================================
    console.log('👉 [Test 7] Customization Test: Creating Local Custom Chapter, Topic, and Task...')
    
    // 7.1. Create Chapter
    const customChapterRes = await fetch(`${API_BASE}/api/school/custom/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_subject_id: schoolSubjectIdA,
        chapter_name: 'Advanced Coding & Robotics',
        chapter_order: 99
      })
    })
    if (!customChapterRes.ok) {
      throw new Error(`Failed to create custom chapter: ${await customChapterRes.text()}`)
    }
    const customChapterData = await customChapterRes.json()
    const customChapterId = customChapterData.chapter.id
    console.log(`   ✓ Custom Chapter Created: "${customChapterData.chapter.chapter_name}" (ID: ${customChapterId}, is_custom: ${customChapterData.chapter.is_custom})`)

    // 7.2. Create Topic
    const customTopicRes = await fetch(`${API_BASE}/api/school/custom/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_chapter_id: customChapterId,
        topic_name: 'Intro to Robot Operating System (ROS)',
        topic_order: 1,
        content_text: 'Deep dive into nodes, topics, and services.',
        resources: [
          { resource_type: 'video', title: 'ROS Tutorial', url: 'https://youtube.com/ros' }
        ]
      })
    })
    if (!customTopicRes.ok) {
      throw new Error(`Failed to create custom topic: ${await customTopicRes.text()}`)
    }
    const customTopicData = await customTopicRes.json()
    const customTopicId = customTopicData.topic.id
    console.log(`   ✓ Custom Topic Created: "${customTopicData.topic.topic_name}" (ID: ${customTopicId}, is_custom: ${customTopicData.topic.is_custom})`)
    console.log(`     - Attached Custom Resource: ${customTopicData.topic.resources[0].title}`)

    // 7.3. Create Task
    const customTaskRes = await fetch(`${API_BASE}/api/school/custom/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_chapter_id: customChapterId,
        school_topic_id: customTopicId,
        title: 'ROS Publisher/Subscriber Node HW',
        instructions: 'Write a basic python script to publish string messages.',
        max_marks: 20
      })
    })
    if (!customTaskRes.ok) {
      throw new Error(`Failed to create custom task: ${await customTaskRes.text()}`)
    }
    const customTaskData = await customTaskRes.json()
    const customTaskId = customTaskData.task.id
    console.log(`   ✓ Custom Task Created: "${customTaskData.task.title}" (ID: ${customTaskId}, is_custom: ${customTaskData.task.is_custom})\n`)

    // =========================================================================
    // E2E Test 8: Customization - Verify we can edit/delete custom items
    // =========================================================================
    console.log('👉 [Test 8] Customization Test: Editing & Deleting Custom Items...')
    
    // Edit custom topic
    const editTopicRes = await fetch(`${API_BASE}/api/school/custom/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: customTopicId,
        school_chapter_id: customChapterId,
        topic_name: 'Intro to Robot Operating System 2 (ROS2)',
        topic_order: 1,
        content_text: 'Deep dive into ROS2 Nodes and DDS.'
      })
    })
    if (!editTopicRes.ok) {
      throw new Error(`Failed to edit custom topic: ${await editTopicRes.text()}`)
    }
    const editTopicData = await editTopicRes.json()
    console.log(`   ✓ Custom Topic Edited successfully: "${editTopicData.topic.topic_name}"`)

    // Edit custom task
    const editTaskRes = await fetch(`${API_BASE}/api/school/tasks/${customTaskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'ROS2 Pub/Sub Publisher Homework'
      })
    })
    if (!editTaskRes.ok) {
      throw new Error(`Failed to edit custom task: ${await editTaskRes.text()}`)
    }
    const editTaskData = await editTaskRes.json()
    console.log(`   ✓ Custom Task Edited successfully: "${editTaskData.task.title}"`)

    // Delete custom task
    const deleteCustomTaskRes = await fetch(`${API_BASE}/api/school/custom/tasks?id=${customTaskId}`, {
      method: 'DELETE'
    })
    if (!deleteCustomTaskRes.ok) {
      throw new Error(`Failed to delete custom task: ${await deleteCustomTaskRes.text()}`)
    }
    console.log(`   ✓ Custom Task Deleted successfully!`)

    // Delete custom topic
    const deleteCustomTopicRes = await fetch(`${API_BASE}/api/syllabus/${customTopicId}?school_id=${schoolAId}`, {
      method: 'DELETE'
    })
    if (!deleteCustomTopicRes.ok) {
      throw new Error(`Failed to delete custom topic: ${await deleteCustomTopicRes.text()}`)
    }
    console.log(`   ✓ Custom Topic Deleted successfully!`)

    // Delete custom chapter
    const deleteCustomChapterRes = await fetch(`${API_BASE}/api/school/custom/chapters?id=${customChapterId}`, {
      method: 'DELETE'
    })
    if (!deleteCustomChapterRes.ok) {
      throw new Error(`Failed to delete custom chapter: ${await deleteCustomChapterRes.text()}`)
    }
    console.log(`   ✓ Custom Chapter Deleted successfully!\n`)

    // =========================================================================
    // E2E Test 9: Multi-tenancy Check - School B Isolation
    // =========================================================================
    console.log('👉 [Test 9] Multi-tenancy Test: Verifying Isolation for School B...')
    
    // Subscribe School B
    const subBResponse = await fetch(`${API_BASE}/api/school/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolBId,
        master_subject_id: masterSubject.id
      })
    })
    if (!subBResponse.ok) {
      throw new Error(`Failed to subscribe School B: ${await subBResponse.text()}`)
    }
    const subBData = await subBResponse.json()
    const schoolSubjectIdB = subBData.school_subject_id
    console.log(`   ✓ School B Subscribed! Created school_subject_id: ${schoolSubjectIdB}`)

    // Create a new custom chapter in School A
    const customChapterARes = await fetch(`${API_BASE}/api/school/custom/chapters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_subject_id: schoolSubjectIdA,
        chapter_name: 'School A Secret Tech Chapter',
        chapter_order: 50
      })
    })
    const customChapterAData = await customChapterARes.json()
    const customChapterAId = customChapterAData.chapter.id
    console.log(`   ✓ Created another custom chapter in School A (ID: ${customChapterAId})`)

    // Now fetch School B subjects with details
    const fetchBResponse = await fetch(`${API_BASE}/api/school/subjects?school_id=${schoolBId}&include_details=true`)
    const fetchBData = await fetchBResponse.json()
    const subB = fetchBData.subjects.find((s: any) => s.id === schoolSubjectIdB)

    // Check if School A's custom chapter leaked into School B
    const leakedChapter = subB.chapters.find((c: any) => c.chapter_name === 'School A Secret Tech Chapter')
    if (leakedChapter) {
      throw new Error('❌ MULTI-TENANCY LEAK DETECTED! School A\'s custom chapter leaked into School B!')
    }
    console.log('   ✓ Success! School B does NOT see School A\'s custom chapter. Complete isolation verified!\n')

  } catch (err) {
    console.error('\n❌ Integration & Verification Tests FAILED:', err)
    process.exit(1)
  } finally {
    // 10. Database Cleanup
    console.log('🧹 Cleaning up temporary database records...')
    if (schoolAId) {
      await pool.query('DELETE FROM schools WHERE id = $1', [schoolAId])
      console.log(`   ✓ Cleaned up School A`)
    }
    if (schoolBId) {
      await pool.query('DELETE FROM schools WHERE id = $1', [schoolBId])
      console.log(`   ✓ Cleaned up School B`)
    }
    await pool.end()
    console.log('\n🌟 Verification script complete!')
  }
}

runTests()
